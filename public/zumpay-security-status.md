# ZUMPAY Security Status and Blockaid Remediation Plan

Last updated: September 17, 2026

This document summarizes the current ZUM token risk posture, completed mitigations, and remaining on-chain actions planned for Blockaid/security-provider reevaluation.

## Key Evidence for Blockaid

The following on-chain actions are complete and externally verifiable:

1. **Treasury concentration was removed from the Safe balance.**
   The Safe transferred `881,000 ZUM` into the deployed treasury vesting contract.
   Funding tx: `0xc3eaa6373d61a17d0403ed05e8c90e788b6629bd1f5392a1a52b3a8032b34775`.

2. **The treasury vesting contract is ownerless and funded.**
   Vesting contract: `0x76A26C670adF0D4CE676e78C38E686d9BaAa6Fc1`.
   It has no owner, no pause, no early withdrawal, no rescue path for vested ZUM, and `releasable()` is `0` before the first unlock.

3. **Founder-held Uniswap V3 LP NFTs were moved out of human control.**
   LP NFT `2945455` transfer tx: `0xc9a5b717af5edeee059d44092c8abe4baeb154f862003351b73d1ad9ae8c3c0d`.
   LP NFT `2945303` transfer tx: `0x6d6dcfde6869024a34cf87331fcd2ebf52b91f063895d64d13133c942d8303e2`.

4. **Both LP NFTs are now held by the liquidity-lock contract.**
   `ownerOf(2945303)` returns `0x6D68B52c1618371e06BF81F88Dc200d028B27294`.
   `ownerOf(2945455)` returns `0x6D68B52c1618371e06BF81F88Dc200d028B27294`.

5. **The LP NFTs are held outside direct human-wallet custody, with non-standard lock disclosure.**
   The LP NFTs are held by the lock contract, but they were transferred through a standard ERC721 transfer rather than the intended safe deposit flow. The project will not describe this as a standard operational LP lock, permanent burn, or non-withdrawable liquidity. Future LP locks should use the intended safe deposit flow or audited locking infrastructure so the lock state is reflected accurately on-chain.

6. **ZUM ownership has been renounced.**
   Ownership renunciation tx: `0x22a11b6fc6e24d98f97e73a0fb9845db8a2996955962567af592f4c5e0211d04`.
   `owner()` now returns `0x0000000000000000000000000000000000000000`.

## Scope

| Item | Value |
| --- | --- |
| Token | ZumPay (ZUM) |
| Chain | Polygon PoS |
| Token contract | `0xa6d942CFd1662A3FD84bce76fb6c1391ea593CB5` |
| Safe multisig treasury | `0xF482058a1f3e2cDF819B76b760c433f0C7d9E78e` |
| Treasury vesting contract | `0x76A26C670adF0D4CE676e78C38E686d9BaAa6Fc1` |
| Vesting deploy tx | `0x6c6084960c6bb0d19d966d9843d76a625c046a680f756a810d85c719a71a27fe` |
| Treasury funding tx | `0xc3eaa6373d61a17d0403ed05e8c90e788b6629bd1f5392a1a52b3a8032b34775` |
| V3 liquidity lock contract | `0x6D68B52c1618371e06BF81F88Dc200d028B27294` |
| V3 liquidity lock deploy tx | `0x42d7fa8d8267d3ed62c064982480387433cb543cf7a4d6b35e1ebc086572c0c7` |
| Sourcify verification | Exact match |
| Blockscout verification | Pass - Verified |
| Maximum supply | 1,000,000 ZUM |
| Treasury reserve | 881,000 ZUM |
| Treasury share | 88.1% of maximum supply |

## Current On-Chain Status

The following values were read from Polygon RPC on September 17, 2026:

| Check | Current result |
| --- | --- |
| `owner()` | `0x0000000000000000000000000000000000000000` |
| Ownership renunciation tx | `0x22a11b6fc6e24d98f97e73a0fb9845db8a2996955962567af592f4c5e0211d04` |
| `totalSupply()` | `1,000,000 ZUM` |
| `balanceOf(Safe)` | `0 ZUM` |
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
| ZUM balance of vesting contract | `881,000 ZUM` |
| ZUM balance of Safe treasury after funding | `0 ZUM` |
| Liquidity lock `beneficiary()` | `0xF482058a1f3e2cDF819B76b760c433f0C7d9E78e` |
| Liquidity lock `unlockTimestamp()` | `1813536000` / June 21, 2027 at 00:00:00 UTC |
| Liquidity lock eligible NFTs | `2945303`, `2945455` |
| `ownerOf(2945303)` | `0x6D68B52c1618371e06BF81F88Dc200d028B27294` |
| `ownerOf(2945455)` | `0x6D68B52c1618371e06BF81F88Dc200d028B27294` |

The token exposes administrative functions such as pause/unpause, blocked-address controls, transaction-limit controls, internal-price controls, ownership transfer, ownership renunciation, and mint. The mint function is capped: because `totalSupply()` already equals `cap()`, simulated additional minting reverts with `ERC20ExceededCap(uint256,uint256)`.

## Completed Mitigations

1. Ownership was moved from a single EOA to the Safe multisig treasury.
2. 881,000 ZUM, representing 88.1% of maximum supply, was transferred to the Safe multisig treasury.
3. A strict treasury vesting contract was implemented in the public repository.
4. The vesting contract has no owner, no pause function, no early withdrawal function, and no rescue path for vested ZUM.
5. Foundry tests verify the unlock schedule and release behavior.
6. The vesting contract was deployed on Polygon at `0x76A26C670adF0D4CE676e78C38E686d9BaAa6Fc1`.
7. The Safe multisig transferred 881,000 ZUM into the vesting contract.
8. A strict Uniswap V3 liquidity-lock contract was deployed on Polygon at `0x6D68B52c1618371e06BF81F88Dc200d028B27294`.
9. The liquidity-lock source was verified on Sourcify with exact match.
10. Uniswap V3 LP NFT `2945455` was transferred into the liquidity-lock contract in tx `0xc9a5b717af5edeee059d44092c8abe4baeb154f862003351b73d1ad9ae8c3c0d`.
11. Uniswap V3 LP NFT `2945303` was transferred into the liquidity-lock contract in tx `0x6d6dcfde6869024a34cf87331fcd2ebf52b91f063895d64d13133c942d8303e2`.
12. ZUM ownership was renounced in tx `0x22a11b6fc6e24d98f97e73a0fb9845db8a2996955962567af592f4c5e0211d04`; `owner()` now returns the zero address.

## Vesting Design

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

1. Optionally repeat source verification directly on PolygonScan with a PolygonScan/Etherscan API key.
2. Increase ZUM/USDC liquidity progressively as project funding and organic user participation allow.
3. For future LP locks, use the intended safe deposit flow or audited locking infrastructure so the lock state is reflected accurately on-chain.

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

Ownership renunciation has been executed. This removed the administrative ability to pause transfers, block wallets, modify transfer limits, update internal token parameters, transfer ownership, or perform owner-only token actions. This action should be treated as irreversible.

## Liquidity Disclosure

ZUMPAY currently has intentionally small, founder-funded liquidity. The project does not represent the current pool as deep or institutionally backed liquidity. Low liquidity can cause significant price movement, and ZUM should not be treated as a guaranteed investment product.

## Liquidity Lock Design

The initial ZUM/USDC Uniswap V3 liquidity is represented by NFT positions `2945303` and `2945455`.

The liquidity-lock contract was deployed to accept NFT positions `2945303` and `2945455`. Both NFTs were transferred to the contract and `ownerOf()` for both positions now returns the lock contract address.

The deployed liquidity-lock contract:

- has no owner;
- accepts only the configured NFT IDs;
- does not expose an early withdrawal or liquidity-decrease path;
- unlocks withdrawal only after June 21, 2027 at 00:00:00 UTC.

Operational note: the NFTs were transferred into the contract with a direct ERC721 transfer rather than the intended safe deposit flow. As a result, they are held by the lock contract and removed from direct human-wallet custody, but the contract did not mark them as deposited in its internal state. The project will not describe the current LP state as a standard operational LP lock, permanent burn, or non-withdrawable liquidity. Future LP locks should use `safeTransferFrom` or audited locking infrastructure so the lock state is accurately reflected on-chain.
