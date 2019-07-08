#!/usr/bin/env node
// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import { JsonRpcSigner } from 'ethers/providers'
import { Address } from '../src/common/types/BasicTypes'
import { waitForMining } from '../src/common/ContractUtils'

const fs = require('fs')
const Path = require('path')
const Ethers = require('ethers')
const Promptly = require('promptly')

import {
  GETH_RPC_URL,
  DEPLOYER_WALLET_FILEPATH,
  DEPLOYER_PASSWORD,
  OPERATOR_WALLET_FILEPATH,
  ROUND_SIZE,
  GAS_PRICE,
  GAS_LIMIT
} from '../config/environment'

async function run() {
  // Connect to blockchain node
  const provider = new Ethers.providers.JsonRpcProvider(GETH_RPC_URL)

  // Load wallets
  let deployerSigner = null
  let operatorSigner = null

  if (process.argv.length > 2 && process.argv[2] == '--UseTestWallets') {
    console.log('Loading test wallets from geth...')

    deployerSigner = provider.getSigner(1)
    operatorSigner = provider.getSigner(2)
  } else {
    console.log('Loading wallets from disk...')
    const deployerWallet = await loadWalletFromFile(
      DEPLOYER_WALLET_FILEPATH!,
      DEPLOYER_PASSWORD
    )

    const operatorWallet = await loadWalletFromFile(OPERATOR_WALLET_FILEPATH!)

    deployerSigner = deployerWallet.connect(provider)
    operatorSigner = operatorWallet.connect(provider)
  }

  const deployerAddress = await deployerSigner.getAddress()
  const operatorAddress = await operatorSigner.getAddress()

  console.log(`Loaded deployer wallet with address ${deployerAddress}`)
  console.log(`Loaded operator wallet with address ${operatorAddress}`)
  console.log('')

  // Deploy the token contracts
  const oaxContractAddress = await deployToken(
    'OAXToken',
    'ETHToken',
    deployerSigner
  )
  console.log('')
  const wethContractAddress = await deployToken(
    'ETHToken',
    'ETHToken',
    deployerSigner
  )
  console.log('')

  // Deploy the mediator contract
  const mediatorContractAddress = await deployMediator(
    operatorAddress,
    ROUND_SIZE,
    deployerSigner
  )

  const mediatorContract = await loadContract(
    'Mediator',
    mediatorContractAddress!,
    operatorSigner
  )
  console.log('')

  // Register assets
  console.log('Registering OAX token with Mediator...')
  await mediatorContract.functions.registerToken(oaxContractAddress, {
    gasPrice: GAS_PRICE
  })
  console.log('Registering WETH token with Mediator...')
  await mediatorContract.functions.registerToken(wethContractAddress, {
    gasPrice: GAS_PRICE
  })
  console.log('')

  const o = {
    assets: {
      OAX: oaxContractAddress,
      WETH: wethContractAddress
    },
    mediator: mediatorContractAddress,
    operator: operatorAddress
  }

  const fname = 'deploy.json'
  fs.writeFileSync(fname, JSON.stringify(o, null, 2))
  console.log(`Saved deployment info to ${fname}.`)

  console.log('Deployment completed successfully.')
}

async function loadWalletFromFile(filePath: string, providedPassword?: string) {
  if (!fs.existsSync(filePath)) {
    throw Error('Could not find wallet file ' + filePath)
  }

  const password =
    providedPassword == undefined
      ? await Promptly.prompt(`Enter wallet password for ${filePath}: `, {
          silent: true
        })
      : providedPassword

  const fileContent = fs.readFileSync(filePath).toString()

  return await Ethers.Wallet.fromEncryptedJson(fileContent, password)
}

async function deployToken(
  name: string,
  contractName: string,
  signer: JsonRpcSigner
) {
  const factory = getContractFactory(contractName, signer)

  console.log(`Deploying token ${name}.`)
  const tx = factory.getDeployTransaction()
  tx.gasLimit = GAS_LIMIT
  tx.gasPrice = GAS_PRICE

  const txSentPromise = signer.sendTransaction(tx)
  const txSent = await txSentPromise
  console.log(`Sent tx with hash ${txSent.hash}. Waiting for mining...`)

  const txReceipt = await waitForMining(txSentPromise)

  const contractAddress = txReceipt.contractAddress

  console.log(`Deployed Token ${name} at ${contractAddress}`)

  return contractAddress
}

async function deployMediator(
  operatorAddress: Address,
  roundSize: number,
  signer: JsonRpcSigner
) {
  const factory = getContractFactory('Mediator', signer)

  console.log(
    `Deploying mediator for operator ${operatorAddress}, ${roundSize}-block rounds.`
  )
  let tx = factory.getDeployTransaction(roundSize, operatorAddress)
  tx.gasLimit = GAS_LIMIT
  tx.gasPrice = GAS_PRICE

  const txSentPromise = signer.sendTransaction(tx)
  const txSent = await txSentPromise

  const txReceipt = await waitForMining(txSentPromise)
  console.log(`Sent tx with hash ${txSent.hash}. Waiting for mining...`)

  const contractAddress = txReceipt.contractAddress

  console.log(`Deployed Mediator at ${contractAddress}`)

  return contractAddress
}

function getContractFactory(name: string, signer: JsonRpcSigner) {
  const abi = fs
    .readFileSync(Path.join(projectRoot(), `build/contracts/${name}.abi`))
    .toString()

  const bin = fs
    .readFileSync(Path.join(projectRoot(), `build/contracts/${name}.bin`))
    .toString()

  return new Ethers.ContractFactory(abi, bin, signer)
}

function projectRoot() {
  let packagePath = Path.join(__dirname, 'package.json')
  let { dir, root, base } = Path.parse(packagePath)

  while (!fs.existsSync(Path.join(dir, base)) && dir !== root) {
    dir = Path.dirname(dir)
  }

  return dir
}

async function loadContract(
  name: string,
  contractAddress: string,
  signer: JsonRpcSigner
) {
  const factory = getContractFactory(name, signer)

  return new Ethers.Contract(contractAddress, factory.interface, signer)
}

run().catch(e => {
  console.log(e)
})