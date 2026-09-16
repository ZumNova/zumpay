// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Vesting {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @title ZumpayTreasuryVesting
/// @notice Strict treasury vesting contract for the ZUM multisig allocation.
/// @dev No owner, no pause, no early withdrawal, and no rescue path for the vested token.
contract ZumpayTreasuryVesting {
    uint256 public constant TRANCHE_COUNT = 10;

    IERC20Vesting public immutable zum;
    address public immutable beneficiary;
    uint256 public immutable totalAllocation;
    uint256 public immutable trancheAmount;
    uint256 public released;

    event Released(address indexed beneficiary, uint256 amount, uint256 totalReleased);

    error InvalidAddress();
    error InvalidAllocation();
    error NothingToRelease();
    error TokenTransferFailed();
    error InvalidTranche();

    constructor(address zumToken, address multisigBeneficiary, uint256 allocation) {
        if (zumToken == address(0) || multisigBeneficiary == address(0)) revert InvalidAddress();
        if (allocation == 0 || allocation % TRANCHE_COUNT != 0) revert InvalidAllocation();

        zum = IERC20Vesting(zumToken);
        beneficiary = multisigBeneficiary;
        totalAllocation = allocation;
        trancheAmount = allocation / TRANCHE_COUNT;
    }

    /// @notice Exact quarterly unlock timestamps at 00:00:00 UTC.
    function unlockTimestamp(uint256 trancheIndex) public pure returns (uint256) {
        if (trancheIndex == 0) return 1_805_587_200; // 2027-03-21
        if (trancheIndex == 1) return 1_813_536_000; // 2027-06-21
        if (trancheIndex == 2) return 1_821_484_800; // 2027-09-21
        if (trancheIndex == 3) return 1_829_347_200; // 2027-12-21
        if (trancheIndex == 4) return 1_837_209_600; // 2028-03-21
        if (trancheIndex == 5) return 1_845_158_400; // 2028-06-21
        if (trancheIndex == 6) return 1_853_107_200; // 2028-09-21
        if (trancheIndex == 7) return 1_860_969_600; // 2028-12-21
        if (trancheIndex == 8) return 1_868_745_600; // 2029-03-21
        if (trancheIndex == 9) return 1_876_694_400; // 2029-06-21
        revert InvalidTranche();
    }

    function unlockedTranches() public view returns (uint256 count) {
        for (uint256 i = 0; i < TRANCHE_COUNT; i++) {
            if (block.timestamp < unlockTimestamp(i)) break;
            count++;
        }
    }

    function vestedAmount() public view returns (uint256) {
        return unlockedTranches() * trancheAmount;
    }

    function releasable() public view returns (uint256) {
        return vestedAmount() - released;
    }

    /// @notice Releases only the vested amount to the Safe multisig beneficiary.
    function release() external {
        uint256 amount = releasable();
        if (amount == 0) revert NothingToRelease();

        released += amount;
        if (!zum.transfer(beneficiary, amount)) revert TokenTransferFailed();

        emit Released(beneficiary, amount, released);
    }
}
