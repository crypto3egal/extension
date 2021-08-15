import Networks, { NetworksState } from "./networks"
import Transactions, { TransactionsState } from "./transactions"
import Accounts, { AccountsState } from "./accounts"
import { SmartContractFungibleAsset } from "./types"
import { apiStubs } from "./temp-stubs"
import { STATE_KEY } from "./constants"
import { DEFAULT_STATE } from "./constants/default-state"
import { migrate } from "./migrations"
import Keys from "./keys"
import {
  startService as startPreferences,
  PreferenceService,
} from "./services/preferences"
import {
  startService as startIndexing,
  IndexingService,
} from "./services/indexing"

import { getPersistedState, persistState } from "./lib/db"
import ObsStore from "./lib/ob-store"
import { getPrice } from "./lib/prices"

export interface MainState {
  accounts: AccountsState
  transactions: TransactionsState
  networks: NetworksState
  tokensToTrack: SmartContractFungibleAsset[]
}

class Main {
  state: ObsStore<MainState>

  network: Networks

  transactions: Transactions

  accounts: Accounts

  #keys: Keys

  private subscriptionIds: any

  /*
   * A promise to the preference service, a dependency for most other services.
   * The promise will be resolved when the service is initialized.
   */
  preferenceService: Promise<PreferenceService>

  /*
   * A promise to the indexing service, keeping track of token balances and
   * prices. The promise will be resolved when the service is initialized.
   */
  indexingService: Promise<IndexingService>

  constructor(state: MainState = DEFAULT_STATE) {
    this.state = new ObsStore<MainState>(state)
    const { accounts, networks, transactions } = state
    this.network = new Networks(networks)
    const { providers } = this.network
    const provider = providers.ethereum.selected
    this.transactions = new Transactions(
      transactions,
      providers.ethereum.selected,
      getPrice
    )
    this.#keys = new Keys()

    this.accounts = new Accounts(
      provider,
      accounts,
      this.transactions.getHistory.bind(this.transactions)
    )
    this.subscriptionIds = {}
    this.subscribeToStates()

    // start all services
    this.initializeServices()
  }

  async initializeServices() {
    this.preferenceService = startPreferences()
    this.indexingService = startIndexing(this.preferenceService)
  }

  /*
    Returns a object containing all api methods for use
  */
  // TODO Stubbed for now.
  // eslint-disable-next-line class-methods-use-this
  getApi() {
    return {
      "/accounts/": {
        ...apiStubs["/accounts/"],
        // overwrite stubbed api methods
        // include an object in the account object for parent which will include refference
        // include in keys get refference for address
      },
    }
  }

  registerSubscription({ route, params, handler, id }) {
    if (!this.subscriptionIds[`${route}${JSON.stringify(params)}`]) {
      this.subscriptionIds[`${route}${JSON.stringify(params)}`] = []
    }
    this.subscriptionIds[`${route}${JSON.stringify(params)}`].push({
      handler,
      id,
    })
  }

  // used to start and stop the ws connections for new head subscription

  async connect() {
    this.network.providers.ethereum.selected.connect()
  }

  async disconnect() {
    this.network.providers.ethereum.selected.close()
  }

  private async import({ address: string, data: string, type: string, name: string }) {
    if (data) {
      return this.#keys.import({ type, data, name })
    }
    return this.accounts.add(address)
  }

  private subscribeToStates() {
    this.transactions.state.on("update", (state) => {
      this.state.updateState({ transactions: state })
    })
    this.network.state.on("update", (state) => {
      this.state.updateState({ networks: state })
    })
  }
}

export { browser } from "webextension-polyfill-ts"
export { connectToBackgroundApi } from "./lib/connect"

export async function startApi(): Promise<{ main: Main }> {
  const rawState = await getPersistedState(STATE_KEY)
  const newVersionState = await migrate(rawState)
  persistState(STATE_KEY, newVersionState)
  const main = new Main(newVersionState.state)
  return { main }
}
