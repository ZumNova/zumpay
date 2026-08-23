# ZUMPAY Whitepaper

Version 1.0  
Official website: https://zumpay.com.ar  
Repository: https://github.com/ZumNova/zumpay  
ZUM token contract on Polygon: `0xa6d942CFd1662A3FD84bce76fb6c1391ea593CB5`

## 1. Executive Summary

ZUMPAY is a non-custodial crypto wallet and educational DeFi interface built to help users learn how to use wallets, tokens, payments, and liquidity pools with a simple and transparent experience.

The project is currently in an early, limited-use stage. It is not designed as a mass-market financial product at this time. The current liquidity is limited and provided by the project founder with personal funds. ZUMPAY does not custody third-party funds, does not take control of user wallets, and does not charge hidden fees.

The ZUM token is used as a utility token inside the ZUMPAY ecosystem. A payment of 100 ZUM unlocks premium wallet features. At the current intended reference price of approximately 0.10 USDC per ZUM, this represents about 10 USDC. This amount is intentionally small so users can learn the basic concepts of token usage and liquidity pools without needing large capital.

## 2. Project Purpose

ZUMPAY was created with two main goals:

1. To provide a simple non-custodial wallet experience for crypto beginners.
2. To teach practical DeFi concepts through small, controlled, real on-chain interactions.

The project is especially intended for people who are new to decentralized finance, including older users who may be learning how wallets, tokens, MetaMask, approvals, and liquidity pools work for the first time.

ZUMPAY is not intended to mislead users, drain wallets, hide fees, or move funds without explicit user action. Every blockchain transaction must be approved by the user through their own wallet, such as MetaMask.

## 3. Current Product Scope

The current ZUMPAY application includes:

- A web-based non-custodial wallet interface.
- Support for EVM networks and native BTC wallet flows.
- ZUM token support on Polygon.
- Premium access unlocked through a 100 ZUM payment.
- Tools for learning and interacting with Uniswap V3 liquidity positions.
- Read-only and guided tools for analyzing liquidity pools.
- Clear wallet, token, amount, and destination information before payment actions.

ZUMPAY is being developed gradually and with limited personal resources. The current focus is usability, education, transparency, and safe learning with small amounts.

## 4. Non-Custodial Design

ZUMPAY is designed as a non-custodial interface.

User wallets and private keys are not held by the project. The application does not have access to user funds unless the user explicitly signs a blockchain transaction from their own wallet.

For internally generated wallets, the seed is generated locally and stored locally in the user's browser environment. The project does not intentionally transmit user seeds or private keys to project servers.

For external wallet actions, ZUMPAY uses MetaMask or another injected wallet provider. Transactions are reviewed and signed by the user from their own wallet.

## 5. ZUM Token

ZUM is the utility token used by ZUMPAY.

| Field | Value |
| --- | --- |
| Token name | ZUM |
| Symbol | ZUM |
| Network | Polygon PoS |
| Token contract | `0xa6d942CFd1662A3FD84bce76fb6c1391ea593CB5` |
| Maximum supply | 1,000,000 ZUM |
| Main utility | Premium access, educational wallet usage, and liquidity learning |
| Official website | https://zumpay.com.ar |
| Public repository | https://github.com/ZumNova/zumpay |

The token is not presented as a guaranteed investment product. It is used as part of the ZUMPAY wallet and educational experience.

## 6. Premium Access

ZUMPAY currently uses a 100 ZUM payment to unlock premium wallet features.

The premium payment has three purposes:

- To unlock access to additional wallet and DeFi tools.
- To introduce users to token transfers and wallet approvals in a controlled way.
- To help users understand the concept of a liquidity pool through a small practical example.

At the current intended reference price of approximately 0.10 USDC per ZUM, the premium access cost is about 10 USDC.

The payment is not hidden. The user can see the token, amount, network, and destination before signing.

## 7. Liquidity Model

The current ZUM liquidity is limited and provided by the project founder using personal funds.

The initial liquidity model is intentionally small and controlled. The pool is intended to be balanced approximately 50% in USDC and 50% in ZUM, with a manual reference target of approximately 0.10 USDC per ZUM.

This controlled liquidity approach is used because the project is currently designed for a small number of users, approximately ten users in the first stage. As more users join, the liquidity pool can be increased gradually to reduce price instability and avoid uncontrolled price movement.

There are currently no third-party user funds deposited into ZUMPAY-controlled liquidity pools. The liquidity currently used to support the project is owned and managed by the founder.

## 8. Fees and Fund Handling

ZUMPAY does not charge hidden fees.

The project does not include malicious logic intended to drain wallets, redirect user funds, or take assets without user approval.

Users may still pay normal blockchain network fees, such as gas fees on Polygon, Ethereum, Arbitrum, or other supported networks. If users interact with external protocols such as Uniswap, those protocols may have their own fees. These are external protocol fees, not hidden ZUMPAY fees.

ZUMPAY does not currently custody third-party user funds. Any user transaction must be approved by the user from their own wallet.

## 9. Smart Contract and Technical Components

The repository includes a Solidity contract named `ZumpayPremiumAccess`.

This contract is designed to formalize the premium payment flow by receiving ZUM payments and recording premium access on-chain.

Main characteristics:

- Receives ZUM payments using `transferFrom`.
- Records premium status with `hasPremium(user)`.
- Emits a `PremiumPaid(address user, uint256 amount)` event.
- Prevents the same user from paying twice.
- Allows owner-only grant and revoke functions for operational support.
- Allows owner-only withdrawal of collected ZUM.
- Uses a two-step ownership transfer pattern.
- Uses a basic non-reentrancy guard.

The purpose of this contract is to make the premium flow more auditable and easier to review than a direct token transfer to a personal wallet.

## 10. Security Status

ZUMPAY does not currently have a formal external audit from a third-party security firm.

The project does include Foundry tests for the premium access contract and the source code is available publicly for review:

https://github.com/ZumNova/zumpay

Current security practices include:

- Open-source repository for review.
- Local non-custodial wallet design.
- Explicit user approval through MetaMask for external wallet transactions.
- Foundry tests for the premium access contract.
- Transparent token, amount, network, and destination information in the user interface.
- Gradual liquidity growth using founder-provided liquidity.

The project welcomes technical review and is willing to provide additional documentation or implementation details to security providers and ecosystem partners.

## 11. Educational Roadmap

ZUMPAY is planned to become more educational over time.

Future improvements include:

- More beginner-friendly explanations inside the website.
- Educational content about wallets, seed phrases, MetaMask, tokens, gas, and liquidity pools.
- A YouTube channel with tutorials for users who are new to crypto and DeFi.
- Clearer guides for people over 50 years old or users who are starting from zero.
- More transparent examples showing how a small liquidity pool works.
- Continued improvements to the premium contract flow and public documentation.

## 12. Current Stage and Limitations

ZUMPAY is an early-stage, founder-funded project.

The current liquidity is intentionally limited. The project is not designed for high-volume public trading at this stage. The initial target is a small controlled group of users who can learn the basic mechanics of wallets, tokens, and DeFi with low amounts.

Because the project is still young, users and reviewers should understand that:

- External audit is still pending.
- Liquidity is limited.
- The project is founder-led.
- Documentation and educational material are still being expanded.
- The product is being improved gradually.

## 13. Contact

Founder / Developer: PABLO AMODIO 
Email: wikerportal@gmail.com  
LinkedIn: https://www.linkedin.com/in/wikerportal/  
GitHub: https://github.com/polwiker1  
Official repository: https://github.com/ZumNova/zumpay  
Official website: https://zumpay.com.ar

## 14. Conclusion

ZUMPAY is a non-custodial wallet and educational DeFi project built around transparency, small-scale learning, and user-controlled transactions.

The project does not custody third-party funds, does not charge hidden fees, and does not include logic designed to move user assets without explicit approval. Current liquidity is limited, founder-provided, and intentionally controlled for a small early user base.

The ZUM token and premium flow are part of an educational and utility-based experience. The project is open to review and willing to provide further documentation to help security providers correctly classify the protocol.
