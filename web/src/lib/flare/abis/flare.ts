// Extracted from @flarenetwork/flare-wagmi-periphery-package (coston2 exports),
// which is no longer a dependency of this app.
//
// Only the fragments Tempo actually calls are kept. The periphery package is a
// wagmi package: importing it pulls React and @tanstack/react-query into every
// serverless function, which is a lot of weight for what amounts to a handful
// of function signatures. Extracting them removes the runtime dependency
// without hand-transcribing anything.

export const registryAbi = [
  {
    "type": "function",
    "inputs": [
      {
        "name": "_name",
        "internalType": "string",
        "type": "string"
      }
    ],
    "name": "getContractAddressByName",
    "outputs": [
      {
        "name": "",
        "internalType": "address",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  }
] as const;

export const assetManagerAbi = [
  {
    "type": "function",
    "inputs": [],
    "name": "fAsset",
    "outputs": [
      {
        "name": "",
        "internalType": "contract IERC20",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  }
] as const;

export const masterAccountControllerAbi = [
  {
    "type": "function",
    "inputs": [
      {
        "name": "_xrplOwner",
        "internalType": "string",
        "type": "string"
      }
    ],
    "name": "getPersonalAccount",
    "outputs": [
      {
        "name": "",
        "internalType": "address",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  }
] as const;

export const personalAccountAbi = [
  {
    "type": "function",
    "inputs": [
      {
        "name": "_calls",
        "internalType": "struct IPersonalAccount.Call[]",
        "type": "tuple[]",
        "components": [
          {
            "name": "target",
            "internalType": "address",
            "type": "address"
          },
          {
            "name": "value",
            "internalType": "uint256",
            "type": "uint256"
          },
          {
            "name": "data",
            "internalType": "bytes",
            "type": "bytes"
          }
        ]
      }
    ],
    "name": "executeUserOp",
    "outputs": [],
    "stateMutability": "payable"
  }
] as const;

export const directMintingAbi = [
  {
    "type": "event",
    "anonymous": false,
    "inputs": [
      {
        "name": "transactionId",
        "internalType": "bytes32",
        "type": "bytes32",
        "indexed": false
      },
      {
        "name": "amount",
        "internalType": "uint256",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "executionAllowedAt",
        "internalType": "uint256",
        "type": "uint256",
        "indexed": false
      }
    ],
    "name": "DirectMintingDelayed"
  },
  {
    "type": "event",
    "anonymous": false,
    "inputs": [
      {
        "name": "transactionId",
        "internalType": "bytes32",
        "type": "bytes32",
        "indexed": false
      },
      {
        "name": "targetAddress",
        "internalType": "address",
        "type": "address",
        "indexed": false
      },
      {
        "name": "executor",
        "internalType": "address",
        "type": "address",
        "indexed": false
      },
      {
        "name": "mintedAmountUBA",
        "internalType": "uint256",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "mintingFeeUBA",
        "internalType": "uint256",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "executorFeeUBA",
        "internalType": "uint256",
        "type": "uint256",
        "indexed": false
      }
    ],
    "name": "DirectMintingExecuted"
  },
  {
    "type": "function",
    "inputs": [],
    "name": "directMintingPaymentAddress",
    "outputs": [
      {
        "name": "",
        "internalType": "string",
        "type": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "inputs": [
      {
        "name": "_payment",
        "internalType": "struct IXRPPayment.Proof",
        "type": "tuple",
        "components": [
          {
            "name": "merkleProof",
            "internalType": "bytes32[]",
            "type": "bytes32[]"
          },
          {
            "name": "data",
            "internalType": "struct IXRPPayment.Response",
            "type": "tuple",
            "components": [
              {
                "name": "attestationType",
                "internalType": "bytes32",
                "type": "bytes32"
              },
              {
                "name": "sourceId",
                "internalType": "bytes32",
                "type": "bytes32"
              },
              {
                "name": "votingRound",
                "internalType": "uint64",
                "type": "uint64"
              },
              {
                "name": "lowestUsedTimestamp",
                "internalType": "uint64",
                "type": "uint64"
              },
              {
                "name": "requestBody",
                "internalType": "struct IXRPPayment.RequestBody",
                "type": "tuple",
                "components": [
                  {
                    "name": "transactionId",
                    "internalType": "bytes32",
                    "type": "bytes32"
                  },
                  {
                    "name": "proofOwner",
                    "internalType": "address",
                    "type": "address"
                  }
                ]
              },
              {
                "name": "responseBody",
                "internalType": "struct IXRPPayment.ResponseBody",
                "type": "tuple",
                "components": [
                  {
                    "name": "blockNumber",
                    "internalType": "uint64",
                    "type": "uint64"
                  },
                  {
                    "name": "blockTimestamp",
                    "internalType": "uint64",
                    "type": "uint64"
                  },
                  {
                    "name": "sourceAddress",
                    "internalType": "string",
                    "type": "string"
                  },
                  {
                    "name": "sourceAddressHash",
                    "internalType": "bytes32",
                    "type": "bytes32"
                  },
                  {
                    "name": "receivingAddressHash",
                    "internalType": "bytes32",
                    "type": "bytes32"
                  },
                  {
                    "name": "intendedReceivingAddressHash",
                    "internalType": "bytes32",
                    "type": "bytes32"
                  },
                  {
                    "name": "spentAmount",
                    "internalType": "int256",
                    "type": "int256"
                  },
                  {
                    "name": "intendedSpentAmount",
                    "internalType": "int256",
                    "type": "int256"
                  },
                  {
                    "name": "receivedAmount",
                    "internalType": "int256",
                    "type": "int256"
                  },
                  {
                    "name": "intendedReceivedAmount",
                    "internalType": "int256",
                    "type": "int256"
                  },
                  {
                    "name": "hasMemoData",
                    "internalType": "bool",
                    "type": "bool"
                  },
                  {
                    "name": "firstMemoData",
                    "internalType": "bytes",
                    "type": "bytes"
                  },
                  {
                    "name": "hasDestinationTag",
                    "internalType": "bool",
                    "type": "bool"
                  },
                  {
                    "name": "destinationTag",
                    "internalType": "uint256",
                    "type": "uint256"
                  },
                  {
                    "name": "status",
                    "internalType": "uint8",
                    "type": "uint8"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "name": "_data",
        "internalType": "bytes",
        "type": "bytes"
      }
    ],
    "name": "executeDirectMintingWithData",
    "outputs": [],
    "stateMutability": "payable"
  }
] as const;

export const directMintingSettingsAbi = [
  {
    "type": "function",
    "inputs": [],
    "name": "getDirectMintingExecutorFeeUBA",
    "outputs": [
      {
        "name": "",
        "internalType": "uint256",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "inputs": [],
    "name": "getDirectMintingFeeBIPS",
    "outputs": [
      {
        "name": "",
        "internalType": "uint256",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "inputs": [],
    "name": "getDirectMintingMinimumFeeUBA",
    "outputs": [
      {
        "name": "",
        "internalType": "uint256",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  }
] as const;

export const fdcHubAbi = [
  {
    "type": "function",
    "inputs": [],
    "name": "fdcRequestFeeConfigurations",
    "outputs": [
      {
        "name": "",
        "internalType": "contract IFdcRequestFeeConfigurations",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "inputs": [
      {
        "name": "_data",
        "internalType": "bytes",
        "type": "bytes"
      }
    ],
    "name": "requestAttestation",
    "outputs": [],
    "stateMutability": "payable"
  }
] as const;

export const fdcFeesAbi = [
  {
    "type": "function",
    "inputs": [
      {
        "name": "_data",
        "internalType": "bytes",
        "type": "bytes"
      }
    ],
    "name": "getRequestFee",
    "outputs": [
      {
        "name": "",
        "internalType": "uint256",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  }
] as const;

export const fdcVerificationAbi = [
  {
    "type": "function",
    "inputs": [],
    "name": "fdcProtocolId",
    "outputs": [
      {
        "name": "_fdcProtocolId",
        "internalType": "uint8",
        "type": "uint8"
      }
    ],
    "stateMutability": "view"
  }
] as const;

export const relayAbi = [
  {
    "type": "function",
    "inputs": [
      {
        "name": "_protocolId",
        "internalType": "uint256",
        "type": "uint256"
      },
      {
        "name": "_votingRoundId",
        "internalType": "uint256",
        "type": "uint256"
      }
    ],
    "name": "isFinalized",
    "outputs": [
      {
        "name": "",
        "internalType": "bool",
        "type": "bool"
      }
    ],
    "stateMutability": "view"
  }
] as const;

export const systemsManagerAbi = [
  {
    "type": "function",
    "inputs": [],
    "name": "firstVotingRoundStartTs",
    "outputs": [
      {
        "name": "",
        "internalType": "uint64",
        "type": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "inputs": [],
    "name": "votingEpochDurationSeconds",
    "outputs": [
      {
        "name": "",
        "internalType": "uint64",
        "type": "uint64"
      }
    ],
    "stateMutability": "view"
  }
] as const;

export const xrpPaymentVerificationAbi = [
  {
    "type": "function",
    "inputs": [
      {
        "name": "_proof",
        "internalType": "struct IXRPPayment.Proof",
        "type": "tuple",
        "components": [
          {
            "name": "merkleProof",
            "internalType": "bytes32[]",
            "type": "bytes32[]"
          },
          {
            "name": "data",
            "internalType": "struct IXRPPayment.Response",
            "type": "tuple",
            "components": [
              {
                "name": "attestationType",
                "internalType": "bytes32",
                "type": "bytes32"
              },
              {
                "name": "sourceId",
                "internalType": "bytes32",
                "type": "bytes32"
              },
              {
                "name": "votingRound",
                "internalType": "uint64",
                "type": "uint64"
              },
              {
                "name": "lowestUsedTimestamp",
                "internalType": "uint64",
                "type": "uint64"
              },
              {
                "name": "requestBody",
                "internalType": "struct IXRPPayment.RequestBody",
                "type": "tuple",
                "components": [
                  {
                    "name": "transactionId",
                    "internalType": "bytes32",
                    "type": "bytes32"
                  },
                  {
                    "name": "proofOwner",
                    "internalType": "address",
                    "type": "address"
                  }
                ]
              },
              {
                "name": "responseBody",
                "internalType": "struct IXRPPayment.ResponseBody",
                "type": "tuple",
                "components": [
                  {
                    "name": "blockNumber",
                    "internalType": "uint64",
                    "type": "uint64"
                  },
                  {
                    "name": "blockTimestamp",
                    "internalType": "uint64",
                    "type": "uint64"
                  },
                  {
                    "name": "sourceAddress",
                    "internalType": "string",
                    "type": "string"
                  },
                  {
                    "name": "sourceAddressHash",
                    "internalType": "bytes32",
                    "type": "bytes32"
                  },
                  {
                    "name": "receivingAddressHash",
                    "internalType": "bytes32",
                    "type": "bytes32"
                  },
                  {
                    "name": "intendedReceivingAddressHash",
                    "internalType": "bytes32",
                    "type": "bytes32"
                  },
                  {
                    "name": "spentAmount",
                    "internalType": "int256",
                    "type": "int256"
                  },
                  {
                    "name": "intendedSpentAmount",
                    "internalType": "int256",
                    "type": "int256"
                  },
                  {
                    "name": "receivedAmount",
                    "internalType": "int256",
                    "type": "int256"
                  },
                  {
                    "name": "intendedReceivedAmount",
                    "internalType": "int256",
                    "type": "int256"
                  },
                  {
                    "name": "hasMemoData",
                    "internalType": "bool",
                    "type": "bool"
                  },
                  {
                    "name": "firstMemoData",
                    "internalType": "bytes",
                    "type": "bytes"
                  },
                  {
                    "name": "hasDestinationTag",
                    "internalType": "bool",
                    "type": "bool"
                  },
                  {
                    "name": "destinationTag",
                    "internalType": "uint256",
                    "type": "uint256"
                  },
                  {
                    "name": "status",
                    "internalType": "uint8",
                    "type": "uint8"
                  }
                ]
              }
            ]
          }
        ]
      }
    ],
    "name": "verifyXRPPayment",
    "outputs": [
      {
        "name": "_proved",
        "internalType": "bool",
        "type": "bool"
      }
    ],
    "stateMutability": "view"
  }
] as const;

export const ftsoV2Abi = [
  {
    "type": "function",
    "inputs": [
      {
        "name": "_feedId",
        "internalType": "bytes21",
        "type": "bytes21"
      }
    ],
    "name": "getFeedByIdInWei",
    "outputs": [
      {
        "name": "_value",
        "internalType": "uint256",
        "type": "uint256"
      },
      {
        "name": "_timestamp",
        "internalType": "uint64",
        "type": "uint64"
      }
    ],
    "stateMutability": "view"
  }
] as const;
