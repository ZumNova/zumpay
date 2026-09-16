# ZUMPAY Blockaid Remediation Plan

Last updated: September 16, 2026

This document summarizes the current ZUM token risk posture, completed mitigations, and remaining on-chain actions planned for Blockaid/security-provider reevaluation.

## Scope

| Item | Value |
| --- | --- |
| Token | ZumPay (ZUM) |
| Chain | Polygon PoS |
| Token contract | `0xa6d942CFd1662A3FD84bce76fb6c1391ea593CB5` |
| Safe multisig treasury | `0xF482058a1f3e2cDF819B76b760c433f0C7d9E78e` |
| Treasury vesting contract | `0x76A26C670adF0D4CE676e78C38E686d9BaAa6Fc1` |
| Vesting deploy tx | `0x6c6084960c6bb0d19d966d9843d76a625c046a680f756a810d85c719a71a27fe` |
| Sourcify verification | Exact match |
| Blockscout verification | Pass - Verified |
| Maximum supply | 1,000,000 ZUM |
| Treasury reserve | 881,000 ZUM |
| Treasury share | 88.1% of maximum supply |

## Current On-Chain Status

The following values were read from Polygon RPC on September 16, 2026:

| Check | Current result |
| --- | --- |
| `owner()` | `0xF482058a1f3e2cDF819B76b760c433f0C7d9E78e` |
| `totalSupply()` | `1,000,000 ZUM` |
| `balanceOf(Safe)` | `881,000 ZUM` |
| `paused()` | `false` |
| `maxTxAmount()` | `0` |
| `internalPrice()` | `0` |
| `blocked(Safe)` | `false` |
| `blocked(deployer)` | `false` |
| `cap()` | `1,000,000 ZUM` |
| Vesting `zum()` | `0xa6d942CFd1662A3FD84bce76fb6c1391ea593CB5` |
| Vesting `beneficiary()` | `0xF482058a1f3e2cDF819B76b760c433f0C7d9E78e` |
| Vesting `totalAllocation()` | `881,000 ZUM` |
| Vesting `trancheAmount()` | `88,100 ZUM` |
| Vesting `releasable()` before first unlock | `0 ZUM` |
| ZUM balance of vesting contract | `0 ZUM`, funding pending |

The token exposes administrative functions such as pause/unpause, blocked-address controls, transaction-limit controls, internal-price controls, ownership transfer, ownership renunciation, and mint. The mint function is capped: because `totalSupply()` already equals `cap()`, simulated additional minting reverts with `ERC20ExceededCap(uint256,uint256)`.

## Completed Mitigations

1. Ownership was moved from a single EOA to the Safe multisig treasury.
2. 881,000 ZUM, representing 88.1% of maximum supply, was transferred to the Safe multisig treasury.
3. A strict treasury vesting contract was implemented in the public repository:
   - `contracts/ZumpayTreasuryVesting.sol`
   - `test/ZumpayTreasuryVesting.t.sol`
   - `script/DeployZumpayTreasuryVesting.s.sol`
4. The vesting contract has no owner, no pause function, no early withdrawal function, and no rescue path for vested ZUM.
5. Foundry tests verify the unlock schedule and release behavior.
6. The vesting contract was deployed on Polygon at `0x76A26C670adF0D4CE676e78C38E686d9BaAa6Fc1`.

## Vesting Design

The vesting contract is designed to lock the Safe treasury allocation and release it only to the Safe multisig beneficiary.

| Field | Value |
| --- | --- |
| Allocation | 881,000 ZUM |
| Tranches | 10 |
| Amount per tranche | 88,100 ZUM |
| First unlock | March 21, 2027 at 00:00:00 UTC |
| Final unlock | June 21, 2029 at 00:00:00 UTC |
| Beneficiary | Safe multisig treasury |
| Release function | Public `release()` |

No account can release ZUM before the defined timestamps. Once funded, the contract can only send vested ZUM to the configured Safe multisig beneficiary.

## Remaining On-Chain Actions

The following actions are required before requesting a final classification update:

1. Transfer 881,000 ZUM from the Safe multisig treasury into the deployed vesting contract.
2. Confirm the vesting contract balance equals 881,000 ZUM.
3. Confirm `beneficiary()` points to the Safe multisig treasury.
4. Confirm `releasable()` is `0` before March 21, 2027.
5. Optionally repeat source verification directly on PolygonScan with a PolygonScan/Etherscan API key.
6. Decide the final admin-control posture for the ZUM token:
   - preferred terminal option: renounce token ownership after verifying the token is unpaused, unblocked, and transferable;
   - conservative alternative: transfer token ownership to an administrative timelock before any later renunciation.

## Ownership Renunciation Checklist

Before calling `renounceOwnership()` on the ZUM token, the following checks must pass:

- `paused()` is `false`.
- `maxTxAmount()` is `0` or otherwise set to a safe value.
- `blocked(Safe)` is `false`.
- `blocked(vestingContract)` is `false`.
- `blocked(mainPool/router)` is `false`, where applicable.
- Transfers from Safe to a normal wallet simulate successfully.
- Transfers involving the vesting contract simulate successfully after funding.
- Treasury allocation is already locked in the vesting contract.
- No further token-admin action is required for product operation.

Renouncing ownership is expected to remove the administrative ability to pause transfers, block wallets, modify transfer limits, update internal token parameters, transfer ownership, or perform owner-only token actions. This action should be treated as irreversible.

## Liquidity Disclosure

ZUMPAY currently has intentionally small, founder-funded liquidity. The project does not represent the current pool as deep or institutionally backed liquidity. The current liquidity model is documented as early-stage and progressive.

This remains a market-risk factor even if token-admin risk is reduced. The project will continue to disclose that low liquidity can cause significant price movement and that users should not treat ZUM as a guaranteed investment product.

## Reevaluation Evidence Package

After deployment and funding, the reevaluation request should include:

- ZUM token contract address.
- Safe multisig treasury address.
- Vesting contract address.
- Source verification links for the vesting contract.
- Transaction hash for vesting contract deployment.
- Transaction hash for transferring 881,000 ZUM into vesting.
- Optional transaction hash for `renounceOwnership()` or administrative-timelock transfer.
- Whitepaper link.
- This remediation-plan link.
