// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../contracts/ZumpayV3LiquidityLock.sol";

interface VmLiquidityLockTest {
    function warp(uint256 newTimestamp) external;
}

contract MockV3PositionManager {
    mapping(uint256 tokenId => address owner) public ownerOf;
    uint256 public collectedTokenId;
    address public collectedRecipient;

    function mint(address to, uint256 tokenId) external {
        ownerOf[tokenId] = to;
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        require(ownerOf[tokenId] == from, "OWNER");
        ownerOf[tokenId] = to;

        if (to.code.length > 0) {
            IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, "");
        }
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        require(ownerOf[tokenId] == from, "OWNER");
        ownerOf[tokenId] = to;
    }

    function collect(IUniswapV3PositionManager.CollectParams calldata params)
        external
        returns (uint256 amount0, uint256 amount1)
    {
        require(ownerOf[params.tokenId] == msg.sender, "NOT_OWNER");
        collectedTokenId = params.tokenId;
        collectedRecipient = params.recipient;
        return (11, 22);
    }
}

contract ZumpayV3LiquidityLockTest {
    address private constant VM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));
    VmLiquidityLockTest private constant vm = VmLiquidityLockTest(VM_ADDRESS);

    address private constant SAFE = address(0xF482058a1f3e2cDF819B76b760c433f0C7d9E78e);
    uint256 private constant TOKEN_ID_0 = 2_945_303;
    uint256 private constant TOKEN_ID_1 = 2_945_455;
    uint256 private constant UNLOCK_AT = 1_876_694_400;

    MockV3PositionManager private manager;
    ZumpayV3LiquidityLock private liquidityLock;

    function setUp() public {
        manager = new MockV3PositionManager();

        uint256[] memory tokenIds = new uint256[](2);
        tokenIds[0] = TOKEN_ID_0;
        tokenIds[1] = TOKEN_ID_1;

        liquidityLock = new ZumpayV3LiquidityLock(address(manager), SAFE, tokenIds, UNLOCK_AT);
        manager.mint(address(this), TOKEN_ID_0);
        manager.mint(address(this), TOKEN_ID_1);
    }

    function testAcceptsOnlyConfiguredPositionNfts() public {
        setUp();

        manager.safeTransferFrom(address(this), address(liquidityLock), TOKEN_ID_0);

        require(manager.ownerOf(TOKEN_ID_0) == address(liquidityLock), "lock did not receive nft");
        require(liquidityLock.depositedTokenId(TOKEN_ID_0), "token not marked deposited");
    }

    function testRejectsUnsupportedNft() public {
        setUp();

        uint256 unsupportedTokenId = 9_999_999;
        manager.mint(address(this), unsupportedTokenId);

        try manager.safeTransferFrom(address(this), address(liquidityLock), unsupportedTokenId) {
            revert("unsupported token accepted");
        } catch {}
    }

    function testCollectsFeesToSafeWhileLocked() public {
        setUp();
        manager.safeTransferFrom(address(this), address(liquidityLock), TOKEN_ID_0);

        (uint256 amount0, uint256 amount1) = liquidityLock.collectFees(TOKEN_ID_0);

        require(amount0 == 11, "wrong amount0");
        require(amount1 == 22, "wrong amount1");
        require(manager.collectedTokenId() == TOKEN_ID_0, "wrong collected token");
        require(manager.collectedRecipient() == SAFE, "fees did not go to safe");
    }

    function testCannotWithdrawBeforeUnlock() public {
        setUp();
        manager.safeTransferFrom(address(this), address(liquidityLock), TOKEN_ID_0);
        vm.warp(UNLOCK_AT - 1);

        try liquidityLock.withdraw(TOKEN_ID_0) {
            revert("early withdrawal allowed");
        } catch {}
    }

    function testWithdrawsToSafeAfterUnlock() public {
        setUp();
        manager.safeTransferFrom(address(this), address(liquidityLock), TOKEN_ID_0);
        vm.warp(UNLOCK_AT);

        liquidityLock.withdraw(TOKEN_ID_0);

        require(manager.ownerOf(TOKEN_ID_0) == SAFE, "safe did not receive nft");
        require(!liquidityLock.depositedTokenId(TOKEN_ID_0), "token still marked deposited");
    }
}
