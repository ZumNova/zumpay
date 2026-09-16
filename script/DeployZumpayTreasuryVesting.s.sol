// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../contracts/ZumpayTreasuryVesting.sol";

interface Vm {
    function envAddress(string calldata key) external view returns (address);
    function envUint(string calldata key) external view returns (uint256);
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeployZumpayTreasuryVesting {
    address private constant VM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));
    Vm private constant vm = Vm(VM_ADDRESS);

    function run() external returns (ZumpayTreasuryVesting vesting) {
        address zum = vm.envAddress("ZUM_ADDRESS");
        address safe = vm.envAddress("ZUM_TREASURY_SAFE");
        uint256 allocation = vm.envUint("ZUM_TREASURY_ALLOCATION");

        vm.startBroadcast();
        vesting = new ZumpayTreasuryVesting(zum, safe, allocation);
        vm.stopBroadcast();
    }
}
