import {task, types} from 'hardhat/config'
import {HardhatRuntimeEnvironment} from 'hardhat/types'
import {providers} from 'ethers'
import {predeploys} from '@eth-optimism/core-utils'
import 'hardhat-deploy'
import '@nomiclabs/hardhat-ethers'
import {getSignerFromArgs} from '../src/utils/misc-utils'
import {CONTRACT_ADDRESSES, CrossChainMessenger, MessageStatus, StandardBridgeAdapter,} from '../src'

task('finalize-withdrawal', 'Finalize a withdrawal')
  .addParam(
    'transactionHash',
    'L2 Transaction hash to finalize',
    '',
    types.string
  )
  .addParam('l2Url', 'L2 HTTP URL', 'http://localhost:9545', types.string)
  .addParam("wallet", "The wallet name to sign this transaction. wallet:add first")
  .addParam("l2Wallet", "The wallet name to sign this transaction on l2. wallet:add first")
  .addOptionalParam("startBlock", "start block number to scan", 0, types.int)
  .addOptionalParam("messageIndex", "message index in case of multiple messages", 0, types.int)
  .setAction(async (args, hre: HardhatRuntimeEnvironment) => {
    const txHash = args.transactionHash
    if (txHash === '') {
      console.log('No tx hash')
    }

    const signer = await getSignerFromArgs(args.wallet, hre.ethers.provider);
    const address = await signer.getAddress()
    console.log(`Using signer: ${address}`)

    const l2Provider = new providers.StaticJsonRpcProvider(args.l2Url)
    const l2Signer = await getSignerFromArgs(args.l2Wallet, l2Provider)

    let Deployment__L1StandardBridgeProxy = await hre.deployments.getOrNull(
      'L1StandardBridgeProxy'
    )
    if (Deployment__L1StandardBridgeProxy === undefined) {
      Deployment__L1StandardBridgeProxy = await hre.deployments.getOrNull(
        'Proxy__OVM_L1StandardBridge'
      )
    }

    let Deployment__L1CrossDomainMessengerProxy =
      await hre.deployments.getOrNull('L1CrossDomainMessengerProxy')
    if (Deployment__L1CrossDomainMessengerProxy === undefined) {
      Deployment__L1CrossDomainMessengerProxy = await hre.deployments.getOrNull(
        'Proxy__OVM_L1CrossDomainMessenger'
      )
    }

    const Deployment__L2OutputOracleProxy = await hre.deployments.getOrNull(
      'L2OutputOracleProxy'
    )
    const Deployment__OptimismPortalProxy = await hre.deployments.getOrNull(
      'OptimismPortalProxy'
    )

    console.log("l2 chain id = " + await l2Signer.getChainId())

    const messenger = new CrossChainMessenger({
      l1SignerOrProvider: signer,
      l2SignerOrProvider: l2Signer,
      l1ChainId: await signer.getChainId(),
      l2ChainId: await l2Signer.getChainId(),
      bridges: {
        Standard: {
          Adapter: StandardBridgeAdapter,
          l1Bridge: CONTRACT_ADDRESSES[await l2Signer.getChainId()].l1.L1StandardBridge, //Deployment__L1StandardBridgeProxy?.address,
          l2Bridge: predeploys.L2StandardBridge,
        },
      },
      contracts: {
        l1: {
          L1StandardBridge: undefined, //Deployment__L1StandardBridgeProxy?.address,
          L1CrossDomainMessenger: undefined, //Deployment__L1CrossDomainMessengerProxy?.address,
          L2OutputOracle: undefined, //Deployment__L2OutputOracleProxy?.address,
          OptimismPortal: undefined, //Deployment__OptimismPortalProxy?.address,
        },
      },
    })

    console.log("L2OutputOracle=" + messenger.contracts.l1.L2OutputOracle.address)
    let startBlock = await messenger.getStartBlockToScan(hre.ethers.provider, args.startBlock)

    console.log(`Fetching message status for ${txHash}`)
    const status = await messenger.getMessageStatus(txHash, startBlock, args.messageIndex)
    console.log(`Status: ${MessageStatus[status]}`)

    if (status === MessageStatus.READY_TO_PROVE) {
      const proveTx = await messenger.proveMessage(txHash, args.messageIndex)
      const proveReceipt = await proveTx.wait()
      console.log('Prove receipt', proveReceipt)

      const finalizeInterval = setInterval(async () => {
        const currentStatus = await messenger.getMessageStatus(txHash, startBlock, args.messageIndex)
        console.log(`Message status: ${MessageStatus[currentStatus]}`)
      }, 3000)

      try {
        await messenger.waitForMessageStatus(
          txHash,
          MessageStatus.READY_FOR_RELAY,
          startBlock,
          args.messageIndex
        )
      } finally {
        clearInterval(finalizeInterval)
      }

      const tx = await messenger.finalizeMessage(txHash, args.messageIndex)
      const receipt = await tx.wait()
      console.log(receipt)
      console.log('Finalized withdrawal')
    }
    else if (status === MessageStatus.READY_FOR_RELAY) {
      const tx = await messenger.finalizeMessage(txHash, args.messageIndex)
      const receipt = await tx.wait()
      console.log(receipt)
      console.log('Finalized withdrawal')
    }
  })
