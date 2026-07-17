// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Minimal {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title ZumpayPremiumAccess
/// @notice Receives ZUM payments and records premium access in an auditable Polygon contract.
contract ZumpayPremiumAccess {
    IERC20Minimal public immutable zum;
    address public owner;
    address public pendingOwner;
    uint256 public premiumPrice;
    bool private locked;

    mapping(address user => bool paid) public hasPremium;

    event PremiumPaid(address indexed user, uint256 amount);
    event PremiumGranted(address indexed user);
    event PremiumRevoked(address indexed user);
    event PremiumPriceUpdated(uint256 oldPrice, uint256 newPrice);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Withdrawn(address indexed to, uint256 amount);

    error AlreadyPremium();
    error InvalidAddress();
    error InvalidAmount();
    error NotOwner();
    error NotPendingOwner();
    error ReentrantCall();
    error TokenTransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (locked) revert ReentrantCall();
        locked = true;
        _;
        locked = false;
    }

    /// @notice Sets the official ZUM token, initial owner, and premium price.
    constructor(address zumToken, address initialOwner, uint256 initialPremiumPrice) {
        if (zumToken == address(0) || initialOwner == address(0)) revert InvalidAddress();
        if (initialPremiumPrice == 0) revert InvalidAmount();
        zum = IERC20Minimal(zumToken);
        owner = initialOwner;
        premiumPrice = initialPremiumPrice;
        emit OwnershipTransferred(address(0), initialOwner);
        emit PremiumPriceUpdated(0, initialPremiumPrice);
    }

    /// @notice Pays premium once with ZUM and records the sender as premium.
    function payPremium() external nonReentrant {
        if (hasPremium[msg.sender]) revert AlreadyPremium();

        uint256 beforeBalance = zum.balanceOf(address(this));
        if (!zum.transferFrom(msg.sender, address(this), premiumPrice)) {
            revert TokenTransferFailed();
        }
        uint256 received = zum.balanceOf(address(this)) - beforeBalance;
        if (received < premiumPrice) revert TokenTransferFailed();

        hasPremium[msg.sender] = true;
        emit PremiumPaid(msg.sender, received);
    }

    /// @notice Lets the owner manually grant premium access without charging ZUM.
    function grantPremium(address user) external onlyOwner {
        if (user == address(0)) revert InvalidAddress();
        hasPremium[user] = true;
        emit PremiumGranted(user);
    }

    /// @notice Lets the owner revoke premium access if needed.
    function revokePremium(address user) external onlyOwner {
        if (user == address(0)) revert InvalidAddress();
        hasPremium[user] = false;
        emit PremiumRevoked(user);
    }

    /// @notice Updates the premium price for future users.
    function setPremiumPrice(uint256 newPremiumPrice) external onlyOwner {
        if (newPremiumPrice == 0) revert InvalidAmount();
        uint256 oldPrice = premiumPrice;
        premiumPrice = newPremiumPrice;
        emit PremiumPriceUpdated(oldPrice, newPremiumPrice);
    }

    /// @notice Starts a two-step ownership transfer.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /// @notice Completes ownership transfer from the pending owner account.
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        address oldOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(oldOwner, msg.sender);
    }

    /// @notice Withdraws a specific amount of ZUM collected by the contract.
    function withdraw(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (!zum.transfer(to, amount)) revert TokenTransferFailed();
        emit Withdrawn(to, amount);
    }

    /// @notice Withdraws all ZUM collected by the contract.
    function withdrawAll(address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert InvalidAddress();
        uint256 amount = zum.balanceOf(address(this));
        if (amount == 0) revert InvalidAmount();
        if (!zum.transfer(to, amount)) revert TokenTransferFailed();
        emit Withdrawn(to, amount);
    }
}
