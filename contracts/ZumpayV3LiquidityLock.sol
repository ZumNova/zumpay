// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC721LiquidityPosition {
    function transferFrom(address from, address to, uint256 tokenId) external;
}

interface IUniswapV3PositionManager {
    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    function collect(CollectParams calldata params) external returns (uint256 amount0, uint256 amount1);
}

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external
        returns (bytes4);
}

/// @title ZumpayV3LiquidityLock
/// @notice Strict lock for selected Uniswap V3 LP NFTs.
/// @dev No owner, no early withdrawal, no liquidity decrease path. Fees can be collected to the Safe.
contract ZumpayV3LiquidityLock is IERC721Receiver {
    IUniswapV3PositionManager public immutable positionManager;
    address public immutable beneficiary;
    uint256 public immutable unlockTimestamp;
    uint256 public immutable tokenCount;

    mapping(uint256 tokenId => bool allowed) public allowedTokenId;
    mapping(uint256 tokenId => bool deposited) public depositedTokenId;

    event PositionDeposited(uint256 indexed tokenId, address indexed from);
    event FeesCollected(uint256 indexed tokenId, uint256 amount0, uint256 amount1);
    event PositionWithdrawn(uint256 indexed tokenId, address indexed beneficiary);

    error InvalidAddress();
    error InvalidUnlockTimestamp();
    error EmptyTokenList();
    error DuplicateTokenId();
    error UnsupportedTokenId();
    error NotPositionManager();
    error AlreadyDeposited();
    error NotDeposited();
    error StillLocked();

    constructor(
        address uniswapV3PositionManager,
        address safeBeneficiary,
        uint256[] memory lockedTokenIds,
        uint256 unlockAt
    ) {
        if (uniswapV3PositionManager == address(0) || safeBeneficiary == address(0)) revert InvalidAddress();
        if (unlockAt <= block.timestamp) revert InvalidUnlockTimestamp();
        if (lockedTokenIds.length == 0) revert EmptyTokenList();

        positionManager = IUniswapV3PositionManager(uniswapV3PositionManager);
        beneficiary = safeBeneficiary;
        unlockTimestamp = unlockAt;
        tokenCount = lockedTokenIds.length;

        for (uint256 i = 0; i < lockedTokenIds.length; i++) {
            uint256 tokenId = lockedTokenIds[i];
            if (allowedTokenId[tokenId]) revert DuplicateTokenId();
            allowedTokenId[tokenId] = true;
        }
    }

    function onERC721Received(address, address from, uint256 tokenId, bytes calldata)
        external
        returns (bytes4)
    {
        if (msg.sender != address(positionManager)) revert NotPositionManager();
        if (!allowedTokenId[tokenId]) revert UnsupportedTokenId();
        if (depositedTokenId[tokenId]) revert AlreadyDeposited();

        depositedTokenId[tokenId] = true;
        emit PositionDeposited(tokenId, from);

        return IERC721Receiver.onERC721Received.selector;
    }

    /// @notice Collects accrued Uniswap V3 fees to the Safe without unlocking liquidity.
    function collectFees(uint256 tokenId) external returns (uint256 amount0, uint256 amount1) {
        if (!depositedTokenId[tokenId]) revert NotDeposited();

        (amount0, amount1) = positionManager.collect(
            IUniswapV3PositionManager.CollectParams({
                tokenId: tokenId,
                recipient: beneficiary,
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        emit FeesCollected(tokenId, amount0, amount1);
    }

    /// @notice Withdraws the LP NFT to the Safe only after the public unlock timestamp.
    function withdraw(uint256 tokenId) external {
        if (block.timestamp < unlockTimestamp) revert StillLocked();
        if (!depositedTokenId[tokenId]) revert NotDeposited();

        depositedTokenId[tokenId] = false;
        IERC721LiquidityPosition(address(positionManager)).transferFrom(address(this), beneficiary, tokenId);

        emit PositionWithdrawn(tokenId, beneficiary);
    }
}
