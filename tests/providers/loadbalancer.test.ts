import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'

import { LoadBalancer } from '../../src/main/proxy/loadbalancer.ts'
import { storeManager } from '../../src/main/store/store.ts'

function installStoreFixture(t: TestContext) {
  const provider = {
    id: 'qwen-ai',
    name: 'Qwen AI',
    apiEndpoint: 'https://chat.qwen.ai',
    enabled: true,
  } as any
  const accounts = [
    { id: 'account-a', providerId: provider.id, name: 'A', status: 'active' },
    { id: 'account-b', providerId: provider.id, name: 'B', status: 'active' },
  ] as any[]
  const originals = {
    getProviders: storeManager.getProviders,
    getAccountsByProviderId: storeManager.getAccountsByProviderId,
    getEffectiveModels: storeManager.getEffectiveModels,
    getConfig: storeManager.getConfig,
  }

  ;(storeManager as any).getProviders = () => [provider]
  ;(storeManager as any).getAccountsByProviderId = () => accounts
  ;(storeManager as any).getEffectiveModels = () => [{
    displayName: 'Qwen3.6-Plus',
    actualModelId: 'qwen3.6-plus',
  }]
  ;(storeManager as any).getConfig = () => ({ modelMappings: {} })

  t.after(() => {
    ;(storeManager as any).getProviders = originals.getProviders
    ;(storeManager as any).getAccountsByProviderId = originals.getAccountsByProviderId
    ;(storeManager as any).getEffectiveModels = originals.getEffectiveModels
    ;(storeManager as any).getConfig = originals.getConfig
  })

  return { provider, accounts }
}

test('Qwen mode suffixes route through the base display model', (t) => {
  installStoreFixture(t)
  const loadBalancer = new LoadBalancer()

  const thinking = loadBalancer.selectAccount('Qwen3.6-Plus-thinking')
  const fast = loadBalancer.selectAccount('Qwen3.6-Plus-fast')

  assert.equal(thinking?.actualModel, 'qwen3.6-plus-thinking')
  assert.equal(fast?.actualModel, 'qwen3.6-plus-fast')
})

test('retry selection excludes accounts already attempted by the request', (t) => {
  installStoreFixture(t)
  const loadBalancer = new LoadBalancer()

  const selected = loadBalancer.selectAccount(
    'Qwen3.6-Plus',
    'round-robin',
    'qwen-ai',
    undefined,
    new Set(['account-a']),
  )

  assert.equal(selected?.account.id, 'account-b')
})

test('quarantined accounts are excluded for every balancing strategy', (t) => {
  installStoreFixture(t)
  const loadBalancer = new LoadBalancer()
  loadBalancer.markAccountFailed('account-a')
  loadBalancer.markAccountFailed('account-a')
  loadBalancer.markAccountFailed('account-a')

  const selected = loadBalancer.selectAccount('Qwen3.6-Plus', 'round-robin')
  assert.equal(selected?.account.id, 'account-b')
})

test('model availability count follows persisted account and provider health', (t) => {
  const { provider, accounts } = installStoreFixture(t)
  const loadBalancer = new LoadBalancer()

  assert.equal(loadBalancer.getAvailableAccountCount('Qwen3.6-Plus', provider.id), 2)
  accounts[0].status = 'error'
  accounts[1].status = 'error'
  assert.equal(loadBalancer.getAvailableAccountCount('Qwen3.6-Plus', provider.id), 0)

  accounts[0].status = 'active'
  provider.enabled = false
  assert.equal(loadBalancer.getAvailableAccountCount('Qwen3.6-Plus', provider.id), 0)
})
