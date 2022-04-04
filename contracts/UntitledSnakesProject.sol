// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./IProofOfHumanity.sol";

/**
 * @title UntitledSnakesProject contract.
 * @notice An NFT collection of 6666 Snakes slithering on the Ethereum Blockchain.
 * All profits from mints by addresses registered on Proof Of Humanity are transferred
 * to the UBIBurner contract, which buys UBI tokens and then burns them.
 * @dev Extends OpenZeppelin's implementation of the ERC-721 Non-Fungible Token Standard.
 */
contract UntitledSnakesProject is ERC721, Ownable {
    /// Maximum number of tokens that can be minted per transaction.
    uint256 public constant MAX_MINT_PER_TX = 10;

    /// Maximum number of tokens that can be minted.
    uint256 public constant MAX_SUPPLY = 6666;

    /// ProofOfHumanity proxy contract address.
    /// On Mainnet: 0x1dAD862095d40d43c2109370121cf087632874dB
    address public immutable POH;

    /// UBIBurner contract address.
    /// On Mainnet: 0x481B24Ed5feAcB37e282729b9815e27529Cf9ae2
    address public immutable UBI_BURNER;

    /// Boolean that indicates if the sale is active or not.
    bool public isSaleActive;

    /// Base URI for all tokens.
    string public baseURI;

    /// Provenance hash of all tokens images.
    string public provenanceHash;

    /// Price to mint one token.
    uint256 public price;

    /// Profits for the UBIBurner contract.
    uint256 public profitsForUBIBurner;

    /// Counter that keeps track of minted tokens.
    uint256 private _tokenCounter;

    /// Emitted when the mint of one or more tokens accumulate profits for the UBIBurner.
    event HumanityLover(address human, uint256[] tokenIds);

    /**
     * Instantiate contract and initialize variables.
     * @param _initialBaseURI Initial base URI for all tokens.
     * @param _price Price to mint one token.
     * @param _pohAddress ProofOfHumanity proxy contract address.
     * @param _ubiBurnerAddress UBIBurner contract address.
     */
    constructor(
        string memory _initialBaseURI,
        uint256 _price,
        address _pohAddress,
        address _ubiBurnerAddress
    ) ERC721("Untitled Snakes Project", "SNAKE") {
        setBaseURI(_initialBaseURI);
        setPrice(_price);
        POH = _pohAddress;
        UBI_BURNER = _ubiBurnerAddress;
    }

    /**
     * Mint tokens and transfer them to the caller.
     * @dev If caller is registered on PoH, accumulate ether value for the UBIBurner contract.
     * @param _quantity Number of tokens to be minted.
     */
    function mint(uint256 _quantity) external payable {
        // Check if sale is active.
        require(isSaleActive, "Sale is not active");

        // Check if minting wouldn't exceed maximum supply of tokens.
        require(
            totalSupply() + _quantity <= MAX_SUPPLY,
            "Would exceed max supply"
        );

        // Check if mint quantity is bigger than zero and doesn't exceed the maximum permitted.
        require(
            _quantity > 0 && _quantity <= MAX_MINT_PER_TX,
            "Invalid mint quantity"
        );

        // Check if ether sent is equal or more than the price of one token * requested quantity.
        require(
            msg.value >= price * _quantity,
            "Ether value sent is not enough"
        );

        // Mint tokens.
        uint256[] memory tokenIds = _mintMultiple(msg.sender, _quantity);

        // Verify if caller is registered on PoH.
        bool isVerifiedHuman = IProofOfHumanity(POH).isRegistered(msg.sender);

        if (isVerifiedHuman) {
            // Accumulate ether value sent for the UBIBurner contract.
            profitsForUBIBurner += msg.value;

            // Emit on-chain declaration that the caller is a humanity lover.
            emit HumanityLover(msg.sender, tokenIds);
        }
    }

    /**
     * Mint tokens for the team.
     * @dev Requires that no tokens have been minted yet, so it can only be called once.
     * @param _quantity Number of tokens to be minted.
     */
    function teamMint(uint256 _quantity) external onlyOwner {
        // Check that there are no minted tokens yet.
        require(totalSupply() == 0, "Cannot be called anymore");

        // Check if mint quantity is bigger than zero and doesn't exceed the maximum permitted.
        require(
            _quantity > 0 && _quantity <= MAX_MINT_PER_TX,
            "Invalid mint quantity"
        );

        // Mint tokens.
        _mintMultiple(msg.sender, _quantity);
    }

    /**
     * Transfer profits from mints made by registered PoH addresses to the UBIBurner contract.
     * Any address can call this function to execute the transfer at any time.
     * @dev Reverts if there are no profits accumulated for the UBIBurner contract.
     */
    function transferToUBIBurner() external {
        // Check if there are profits to transfer to the UBIBurner contract.
        require(profitsForUBIBurner > 0, "Nothing to transfer");

        // Save amount to transfer.
        uint256 amount = profitsForUBIBurner;

        // Update state before making the transfer.
        profitsForUBIBurner = 0;

        // Transfer amount to the UBIBurner contract.
        (bool success, ) = UBI_BURNER.call{value: amount}("");
        require(success, "UBIBurner transfer failed");
    }

    /**
     * Withdraw contract balance minus profits for the UBIBurner contract.
     * @dev Reverts if contract balance is not bigger than profits for the UBIBurner contract.
     */
    function withdraw() external onlyOwner {
        // Check if there are funds to withdraw.
        require(
            address(this).balance > profitsForUBIBurner,
            "Nothing to withdraw"
        );

        // Calculate amount to withdraw.
        uint256 amount = address(this).balance - profitsForUBIBurner;

        // Withdraw funds.
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Withdraw failed");
    }

    /**
     * Set the base URI for all tokens.
     * @dev Will be used to update {baseURI} with the final IPFS base URI after minting.
     * @param _newBaseURI Base URI for all tokens.
     */
    function setBaseURI(string memory _newBaseURI) public onlyOwner {
        baseURI = _newBaseURI;
    }

    /**
     * Set the price to mint one token.
     * @param _newPrice Price to mint one token.
     */
    function setPrice(uint256 _newPrice) public onlyOwner {
        price = _newPrice;
    }

    /**
     * Set the provenance hash of all tokens images.
     * @dev Will be used to set the final provenance hash once it's calculated.
     * @param _provenanceHash Provenance hash of all tokens images.
     */
    function setProvenanceHash(string memory _provenanceHash) public onlyOwner {
        provenanceHash = _provenanceHash;
    }

    /**
     * Toggle the sale status: inactive --> active, and vice versa.
     */
    function toggleSaleStatus() public onlyOwner {
        isSaleActive = !isSaleActive;
    }

    /**
     * Return the current supply of tokens.
     * @return Number of tokens minted.
     */
    function totalSupply() public view returns (uint256) {
        return _tokenCounter;
    }

    /**
     * Return the base URI for all tokens.
     * @dev Overrides {_baseURI} function from parent ERC721 contract.
     * @return Base URI for all tokens.
     */
    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    /**
     * Mint multiple tokens for `_to`.
     * @dev Updates the token counter after all tokens are minted.
     * @param _to Address that will receive the tokens.
     * @param _quantity Number of tokens to mint.
     * @return Array of tokenIds minted.
     */
    function _mintMultiple(address _to, uint256 _quantity)
        private
        returns (uint256[] memory)
    {
        // Fixed-size array to store minted tokenIds.
        uint256[] memory tokenIds = new uint256[](_quantity);

        // Mint each requested token.
        for (uint256 i; i < _quantity; i++) {
            tokenIds[i] = _tokenCounter + i;
            _safeMint(_to, tokenIds[i]);
        }

        // Update token counter.
        _tokenCounter += _quantity;

        return tokenIds;
    }
}
