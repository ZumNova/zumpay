// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../contracts/ZumpayV3LiquidityLock.sol";

interface VmLiquidityLock {
    function envAddress(string calldata key) external view returns (address);
    function envUint(string calldata key) external view returns (uint256);
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeployZumpayV3LiquidityLock {
    address private constant VM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));
    VmLiquidityLock private constant vm = VmLiquidityLock(VM_ADDRESS);

    function run() external returns (ZumpayV3LiquidityLock liquidityLock) {
        address positionManager = vm.envAddress("UNISWAP_V3_POSITION_MANAGER");
        address beneficiary = vm.envAddress("ZUM_TREASURY_SAFE");
        uint256 unlockAt = vm.envUint("ZUM_LIQUIDITY_UNLOCK_TIMESTAMP");

        uint256[] memory tokenIds = new uint256[](2);
        tokenIds[0] = vm.envUint("ZUM_LIQUIDITY_NFT_ID_0");
        tokenIds[1] = vm.envUint("ZUM_LIQUIDITY_NFT_ID_1");

        vm.startBroadcast();
        liquidityLock = new ZumpayV3LiquidityLock(positionManager, beneficiary, tokenIds, unlockAt);
        vm.stopBroadcast();
    }
}
