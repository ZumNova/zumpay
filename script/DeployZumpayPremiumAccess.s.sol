// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../contracts/ZumpayPremiumAccess.sol";

interface Vm {
    function envAddress(string calldata key) external view returns (address);
    function envUint(string calldata key) external view returns (uint256);
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeployZumpayPremiumAccess {
    address private constant VM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));
    Vm private constant vm = Vm(VM_ADDRESS);

    function run() external returns (ZumpayPremiumAccess premium) {
        address zum = vm.envAddress("ZUM_ADDRESS");
        address owner = vm.envAddress("PREMIUM_OWNER");
        uint256 price = vm.envUint("PREMIUM_PRICE");

        vm.startBroadcast();
        premium = new ZumpayPremiumAccess(zum, owner, price);
        vm.stopBroadcast();
    }
}
