// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../contracts/ZumpayPremiumAccess.sol";

contract MockZum {
    string public constant name = "ZUM";
    string public constant symbol = "ZUM";
    uint8 public constant decimals = 18;

    mapping(address account => uint256 balance) public balanceOf;
    mapping(address owner => mapping(address spender => uint256 amount)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "BALANCE");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "BALANCE");
        require(allowance[from][msg.sender] >= amount, "ALLOWANCE");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract ZumpayPremiumAccessTest {
    MockZum private zum;
    ZumpayPremiumAccess private premium;

    uint256 private constant PRICE = 100 ether;

    function setUp() public {
        zum = new MockZum();
        premium = new ZumpayPremiumAccess(address(zum), address(this), PRICE);
        zum.mint(address(this), 1_000 ether);
    }

    function testPayPremiumRecordsAccessAndReceivesZum() public {
        setUp();
        zum.approve(address(premium), PRICE);

        premium.payPremium();

        require(premium.hasPremium(address(this)), "premium not recorded");
        require(zum.balanceOf(address(premium)) == PRICE, "zum not received");
    }

    function testCannotPayTwice() public {
        setUp();
        zum.approve(address(premium), PRICE * 2);
        premium.payPremium();

        try premium.payPremium() {
            revert("double payment allowed");
        } catch {}
    }

    function testOwnerCanGrantAndRevokePremium() public {
        setUp();
        address user = address(0xBEEF);

        premium.grantPremium(user);
        require(premium.hasPremium(user), "grant failed");

        premium.revokePremium(user);
        require(!premium.hasPremium(user), "revoke failed");
    }

    function testOwnerCanWithdrawAll() public {
        setUp();
        zum.approve(address(premium), PRICE);
        premium.payPremium();

        uint256 beforeBalance = zum.balanceOf(address(this));
        premium.withdrawAll(address(this));

        require(zum.balanceOf(address(premium)) == 0, "contract still funded");
        require(zum.balanceOf(address(this)) == beforeBalance + PRICE, "withdraw failed");
    }
}
