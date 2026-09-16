// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../contracts/ZumpayTreasuryVesting.sol";

interface Vm {
    function warp(uint256 newTimestamp) external;
}

contract MockVestingZum {
    mapping(address account => uint256 balance) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "BALANCE");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract ZumpayTreasuryVestingTest {
    address private constant VM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));
    Vm private constant vm = Vm(VM_ADDRESS);

    MockVestingZum private zum;
    ZumpayTreasuryVesting private vesting;

    address private constant SAFE = address(0xF482058a1f3e2cDF819B76b760c433f0C7d9E78e);
    uint256 private constant ALLOCATION = 881_000 ether;
    uint256 private constant TRANCHE = 88_100 ether;

    function setUp() public {
        zum = new MockVestingZum();
        vesting = new ZumpayTreasuryVesting(address(zum), SAFE, ALLOCATION);
        zum.mint(address(vesting), ALLOCATION);
    }

    function testScheduleUsesExactQuarterlyDates() public {
        setUp();

        require(vesting.unlockTimestamp(0) == 1_805_587_200, "wrong first unlock");
        require(vesting.unlockTimestamp(1) == 1_813_536_000, "wrong second unlock");
        require(vesting.unlockTimestamp(9) == 1_876_694_400, "wrong final unlock");
    }

    function testNothingReleasesBeforeFirstUnlock() public {
        setUp();
        vm.warp(1_805_587_199);

        require(vesting.vestedAmount() == 0, "vested early");
        require(vesting.releasable() == 0, "releasable early");

        try vesting.release() {
            revert("released before first unlock");
        } catch {}
    }

    function testReleasesTenPercentAtFirstUnlock() public {
        setUp();
        vm.warp(1_805_587_200);

        require(vesting.vestedAmount() == TRANCHE, "wrong vested amount");
        vesting.release();

        require(zum.balanceOf(SAFE) == TRANCHE, "safe did not receive tranche");
        require(vesting.released() == TRANCHE, "released not recorded");
        require(vesting.releasable() == 0, "released too little");
    }

    function testReleasesAccumulatedTranchesOnlyOnce() public {
        setUp();
        vm.warp(1_821_484_800);

        vesting.release();

        require(zum.balanceOf(SAFE) == TRANCHE * 3, "wrong accumulated release");
        require(vesting.released() == TRANCHE * 3, "wrong released total");

        try vesting.release() {
            revert("double release allowed");
        } catch {}
    }

    function testFinalUnlockReleasesFullAllocation() public {
        setUp();
        vm.warp(1_876_694_400);

        vesting.release();

        require(zum.balanceOf(SAFE) == ALLOCATION, "full allocation not released");
        require(zum.balanceOf(address(vesting)) == 0, "vesting still funded");
        require(vesting.released() == ALLOCATION, "released total mismatch");
    }
}
