import { AddressOnNetwork } from "../../accounts"
import { getNFTCollections, getNFTs } from "../../lib/nfts_update"
import BaseService from "../base"
import ChainService from "../chain"

import { ServiceCreatorFunction, ServiceLifecycleEvents } from "../types"
import { getOrCreateDB, NFTsDatabase } from "./db"

interface Events extends ServiceLifecycleEvents {
  initializeNFTs: string // TODO initialize redux from database
  updateNFTs: string // TODO update redux
}

export default class NFTsService extends BaseService<Events> {
  #nextPageUrls: string[] = []

  static create: ServiceCreatorFunction<
    Events,
    NFTsService,
    [Promise<ChainService>]
  > = async (chainService) => {
    return new this(await getOrCreateDB(), await chainService)
  }

  private constructor(
    private db: NFTsDatabase,
    private chainService: ChainService
  ) {
    super()
  }

  protected override async internalStartService(): Promise<void> {
    await super.internalStartService()

    this.connectChainServiceEvents()

    this.emitter.emit("initializeNFTs", "TODO")
  }

  protected override async internalStopService(): Promise<void> {
    this.db.close()

    await super.internalStopService()
  }

  private async connectChainServiceEvents(): Promise<void> {
    this.chainService.emitter.once("serviceStarted").then(async () => {
      this.fetchCollections()
    })

    this.chainService.emitter.on(
      "newAccountToTrack",
      async (addressOnNetwork) => this.fetchCollections([addressOnNetwork])
    )
  }

  async fetchCollections(accounts?: AddressOnNetwork[]): Promise<void> {
    const accountsToFetch =
      accounts ?? (await this.chainService.getAccountsToTrack())

    getNFTCollections(accountsToFetch).forEach((request) =>
      request.then(async (collections) => {
        await this.db.updateCollections(collections)

        this.emitter.emit("updateNFTs", "")
      })
    )
  }

  async fetchNFTsFromCollection(
    collections: string[],
    accounts?: AddressOnNetwork[]
  ): Promise<void> {
    const accountsToFetch =
      accounts ?? (await this.chainService.getAccountsToTrack())

    getNFTs(accountsToFetch, collections).forEach((request) =>
      request.then(async ({ nfts, nextPageURLs }) => {
        await this.db.updateNFTs(nfts)
        this.#nextPageUrls.push(...nextPageURLs)

        this.emitter.emit("updateNFTs", "")
      })
    )
  }
}
