// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract XPay {
    address public relay;

    mapping(address => uint256) private balances;
    mapping(address => bool) private registered;

    event Deposited(address indexed user, uint256 amount);
    event Transferred(address indexed from, address indexed to, uint256 amount);
    event Registered(address indexed user);

    modifier onlyRelay() {
        require(msg.sender == relay, "Only relay allowed");
        _;
    }

    constructor(address _relay) {
        relay = _relay;
    }

    function registerFor(address user) external onlyRelay {
        require(!registered[user], "Already registered");
        registered[user] = true;
        emit Registered(user);
    }

    function depositFor(address user, uint256 amount) external onlyRelay {
        require(registered[user], "Not registered");
        require(amount > 0, "Amount must be > 0");
        require(amount <= 1000, "Amount must be <= 1000");
        balances[user] += amount;
        emit Deposited(user, amount);
    }

    function transferFor(address from, address to, uint256 amount) external onlyRelay {
        require(registered[from], "Sender not registered");
        require(registered[to], "Recipient not registered");
        require(amount > 0, "Amount must be > 0");
        require(balances[from] >= amount, "Insufficient balance");
        require(from != to, "Cannot transfer to yourself");
        balances[from] -= amount;
        balances[to] += amount;
        emit Transferred(from, to, amount);
    }

    function isRegistered(address user) external view returns (bool) {
        return registered[user];
    }

    function getBalance(address user) external view returns (uint256) {
        return balances[user];
    }
}