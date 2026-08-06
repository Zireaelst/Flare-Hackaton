// Generated from contracts/out/Tempo.sol/Tempo.json — do not edit by hand.
export const tempoAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "_fxrp",
        "type": "address",
        "internalType": "contract IERC20"
      },
      {
        "name": "_ftsoV2",
        "type": "address",
        "internalType": "contract IFtsoV2"
      },
      {
        "name": "_priceFeedId",
        "type": "bytes21",
        "internalType": "bytes21"
      },
      {
        "name": "_maxPriceAge",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "_vaultDepositAdapter",
        "type": "address",
        "internalType": "contract IActionAdapter"
      },
      {
        "name": "_redeemAdapter",
        "type": "address",
        "internalType": "contract IActionAdapter"
      },
      {
        "name": "_vaultWithdrawAdapter",
        "type": "address",
        "internalType": "contract IActionAdapter"
      },
      {
        "name": "_swapAdapter",
        "type": "address",
        "internalType": "contract IActionAdapter"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "WHOLE_BALANCE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "cancel",
    "inputs": [
      {
        "name": "orderId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "createOrder",
    "inputs": [
      {
        "name": "params",
        "type": "tuple",
        "internalType": "struct Tempo.OrderParams",
        "components": [
          {
            "name": "kind",
            "type": "uint8",
            "internalType": "enum Tempo.OrderKind"
          },
          {
            "name": "action",
            "type": "uint8",
            "internalType": "enum Tempo.ActionKind"
          },
          {
            "name": "vault",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "xrplAddress",
            "type": "bytes",
            "internalType": "bytes"
          },
          {
            "name": "amountPerSlice",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "slices",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "intervalSeconds",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "priceTarget",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "expiry",
            "type": "uint64",
            "internalType": "uint64"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "orderId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "dueOrders",
    "inputs": [
      {
        "name": "from",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "count",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "ids",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "execute",
    "inputs": [
      {
        "name": "orderId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "ftsoV2",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IFtsoV2"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "fxrp",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IERC20"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getOrder",
    "inputs": [
      {
        "name": "orderId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct Tempo.Order",
        "components": [
          {
            "name": "owner",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "kind",
            "type": "uint8",
            "internalType": "enum Tempo.OrderKind"
          },
          {
            "name": "action",
            "type": "uint8",
            "internalType": "enum Tempo.ActionKind"
          },
          {
            "name": "cancelled",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "vault",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "amountPerSlice",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "slices",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "slicesExecuted",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "intervalSeconds",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "nextExecutionAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "expiry",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "priceTarget",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "xrplAddress",
            "type": "bytes",
            "internalType": "bytes"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "maxPriceAge",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "orderCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "previewExecutable",
    "inputs": [
      {
        "name": "orderId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "executable",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "reason",
        "type": "uint8",
        "internalType": "enum Tempo.NotExecutableReason"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "priceFeedId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes21",
        "internalType": "bytes21"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "redeemAdapter",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IActionAdapter"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "swapAdapter",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IActionAdapter"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "vaultDepositAdapter",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IActionAdapter"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "vaultWithdrawAdapter",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IActionAdapter"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "OrderCancelledEvent",
    "inputs": [
      {
        "name": "orderId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "slicesRemaining",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OrderCreated",
    "inputs": [
      {
        "name": "orderId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "kind",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum Tempo.OrderKind"
      },
      {
        "name": "action",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum Tempo.ActionKind"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OrderExecuted",
    "inputs": [
      {
        "name": "orderId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "executor",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "slice",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "price",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "InvalidAmount",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidExpiry",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidInterval",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidPriceTarget",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidSlices",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidVault",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidXrplAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NoSuchOrder",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotOwner",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NothingToMove",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OrderCancelled",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OrderCompleted",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OrderExpired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PriceNotReached",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "StalePrice",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TooEarly",
    "inputs": []
  },
  {
    "type": "error",
    "name": "WholeBalanceNeedsOneSlice",
    "inputs": []
  }
] as const;
