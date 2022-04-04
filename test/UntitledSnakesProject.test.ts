import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  deployMockContract,
  MockContract,
} from "@ethereum-waffle/mock-contract";
import IProofOfHumanity from "../artifacts/contracts/IProofOfHumanity.sol/IProofOfHumanity.json";
import UBIBurner from "./mock/UBIBurner.json";

const {
  BigNumber,
  ContractFactory,
  getContractFactory,
  getSigners,
  provider: { getBalance },
  utils: { parseEther },
} = ethers;

/**
 * All tests for the UntitledSnakesProject contract with full code coverage.
 */
describe("UntitledSnakesProject contract", function () {
  let UntitledSnakesProject;
  let contract: Contract;
  let ubiBurner: Contract;
  let mockPoH: MockContract;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;
  let addrs: SignerWithAddress[];

  const baseURI = "https://snakesproject.com/api/snake/";
  const price = parseEther("0.02");

  /**
   * Hook that is ran before each test is executed.
   * Deploys the contract and gets the signers addresses.
   */
  beforeEach(async function () {
    // Get signers
    [owner, addr1, addr2, ...addrs] = await getSigners();

    // Mocked ProofOfHumanity contract
    mockPoH = await deployMockContract(owner, IProofOfHumanity.abi);
    // Instantiate mock `isRegistered()` function and return false by default
    await mockPoH.mock.isRegistered.returns(false);

    // It's not possible to mock a contract's receive() function with Waffle.
    // See https://github.com/TrueFiEng/Waffle/issues/557
    // We deploy the original UBIBurner contract instead.
    ubiBurner = await new ContractFactory(
      UBIBurner.abi,
      UBIBurner.bytecode,
      owner
    ).deploy(addrs[0].address, addrs[1].address);

    // Deploy of the UntitledSnakesProject contract
    UntitledSnakesProject = await getContractFactory("UntitledSnakesProject");
    contract = await UntitledSnakesProject.deploy(
      baseURI,
      price,
      mockPoH.address,
      ubiBurner.address
    );
  });

  /**
   * Deployment tests.
   * Verify that all variables are correctly set after deployment.
   */
  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await contract.owner()).to.equal(owner.address);
    });

    it("Should set the right constant values for MAX_SUPPLY and MAX_MINT_PER_TX", async function () {
      expect(await contract.MAX_SUPPLY()).to.equal(BigNumber.from(6666));
      expect(await contract.MAX_MINT_PER_TX()).to.equal(BigNumber.from(10));
    });

    it("Should set the right default values for profitsForUBIBurner, provenanceHash and isSaleActive", async function () {
      expect(await contract.profitsForUBIBurner()).to.equal(BigNumber.from(0));
      expect(await contract.provenanceHash()).to.equal("");
      // eslint-disable-next-line no-unused-expressions
      expect(await contract.isSaleActive()).to.be.false;
    });

    it("Should set the right name and symbol", async function () {
      expect(await contract.name()).to.equal("Untitled Snakes Project");
      expect(await contract.symbol()).to.equal("SNAKE");
    });

    it("Should initialize variables with the correct value in the constructor", async function () {
      expect(await contract.baseURI()).to.equal(baseURI);
      expect(await contract.price()).to.equal(price);
      expect(await contract.POH()).to.equal(mockPoH.address);
      expect(await contract.UBI_BURNER()).to.equal(ubiBurner.address);
    });
  });

  /**
   * Setters tests.
   * Verify that all setters functions work as expected.
   */
  describe("Setters", function () {
    it("Should set a new baseURI correctly", async function () {
      const newBaseURI = "https://new-base-uri.com/";

      await contract.setBaseURI(newBaseURI);

      expect(await contract.baseURI()).to.equal(newBaseURI);
    });

    it("Should revert setBaseURI call if caller is not the owner", async function () {
      const tx = contract
        .connect(addr1)
        .setBaseURI("https://new-base-uri.com/");

      await expect(tx).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should set a new price correctly", async function () {
      const newPrice = parseEther("1");

      await contract.setPrice(newPrice);

      expect(await contract.price()).to.equal(newPrice);
    });

    it("Should revert setPrice call if caller is not the owner", async function () {
      const tx = contract.connect(addr1).setPrice(parseEther("1"));

      await expect(tx).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should set the provenance hash correctly", async function () {
      const newProvenanceHash =
        "f1bd97babbe603d15e1c850eb0c63b3fb68e52c520fce11388ba3d4f85347290";

      await contract.setProvenanceHash(newProvenanceHash);

      expect(await contract.provenanceHash()).to.equal(newProvenanceHash);
    });

    it("Should revert setProvenanceHash call if caller is not the owner", async function () {
      const tx = contract
        .connect(addr1)
        .setProvenanceHash(
          "f1bd97babbe603d15e1c850eb0c63b3fb68e52c520fce11388ba3d4f85347290"
        );

      await expect(tx).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should toggle the sale status correctly", async function () {
      await contract.toggleSaleStatus();

      // eslint-disable-next-line no-unused-expressions
      expect(await contract.isSaleActive()).to.be.true;
    });

    it("Should revert toggleSaleStatus call if caller is not the owner", async function () {
      const tx = contract.connect(addr1).toggleSaleStatus();

      await expect(tx).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  /**
   * Mint tests.
   * Verify that the mint function works as expected.
   */
  describe("Mint", function () {
    it("Should mint tokens successfully", async function () {
      await contract.toggleSaleStatus();
      await contract.mint(10, {
        value: price.mul(10),
      });

      expect(await getBalance(contract.address)).to.equal(price.mul(10));
      expect(await contract.balanceOf(owner.address)).to.equal(
        BigNumber.from(10)
      );
    });

    it("Should accumulate the mint value for the UBIBurner contract", async function () {
      await mockPoH.mock.isRegistered.returns(true);

      await contract.toggleSaleStatus();

      await contract.mint(10, {
        value: price.mul(10),
      });

      expect(await contract.profitsForUBIBurner()).to.equal(price.mul(10));
    });

    it("Should emit HumanityLover event when the minting address is registered on PoH", async function () {
      await mockPoH.mock.isRegistered.returns(true);

      await contract.toggleSaleStatus();

      const tx1 = await contract.connect(addr1).mint(2, {
        value: price.mul(2),
      });

      expect(tx1)
        .to.emit(contract, "HumanityLover")
        .withArgs(addr1.address, [0, 1]);

      const tx2 = await contract.connect(addr2).mint(5, {
        value: price.mul(5),
      });

      expect(tx2)
        .to.emit(contract, "HumanityLover")
        .withArgs(addr2.address, [2, 3, 4, 5, 6]);
    });

    it("Should not emit HumanityLover event when the minting address is not registered on PoH", async function () {
      await contract.toggleSaleStatus();

      const tx = await contract.mint(1, {
        value: price,
      });

      expect(tx).to.not.emit(contract, "HumanityLover");
    });

    it("Should not accumulate the mint value for the UBIBurner contract", async function () {
      await contract.toggleSaleStatus();

      await contract.mint(10, {
        value: price.mul(10),
      });

      expect(await contract.profitsForUBIBurner()).to.equal(BigNumber.from(0));
    });

    it("Should only accumulate funds for the UBIBurner contract when the minting address is registered on PoH", async function () {
      // Only addr1 is registered on PoH
      await mockPoH.mock.isRegistered.withArgs(addr1.address).returns(true);

      await contract.toggleSaleStatus();

      await contract.connect(addr1).mint(5, {
        value: price.mul(5),
      });
      await contract.connect(addr2).mint(10, {
        value: price.mul(10),
      });

      expect(await contract.profitsForUBIBurner()).to.equal(price.mul(5));
    });

    it("Should revert mint call if sale is not active", async function () {
      const tx = contract.mint(1, { value: price });

      await expect(tx).to.be.revertedWith("Sale is not active");
    });

    it("Should revert mint call if number of tokens to mint is set to zero", async function () {
      await contract.toggleSaleStatus();

      const tx = contract.mint(0);

      await expect(tx).to.be.revertedWith("Invalid mint quantity");
    });

    it("Should revert mint call if number of tokens to mint is bigger than 10", async function () {
      await contract.toggleSaleStatus();

      const tx = contract.mint(11, { value: price.mul(11) });

      await expect(tx).to.be.revertedWith("Invalid mint quantity");
    });

    it("Should revert mint call if purchase would exceed max supply", async function () {
      await contract.toggleSaleStatus();

      // Mint 6660 tokens (max 10 per tx)
      for (let i = 0; i < 666; i++) {
        await contract.mint(10, {
          value: price.mul(10),
        });
      }

      // Try to mint 7 more
      const tx = contract.mint(7, { value: price.mul(7) });

      await expect(tx).to.be.revertedWith("Would exceed max supply");
    });

    it("Should revert mint call if ether value sent is not enough", async function () {
      await contract.toggleSaleStatus();

      const tx1 = contract.mint(1, { value: price.sub(1) });
      const tx2 = contract.mint(2, { value: price.mul(2).sub(1) });
      const tx3 = contract.mint(1);

      await expect(tx1).to.be.revertedWith("Ether value sent is not enough");
      await expect(tx2).to.be.revertedWith("Ether value sent is not enough");
      await expect(tx3).to.be.revertedWith("Ether value sent is not enough");
    });
  });

  /**
   * Team Mint tests.
   * Verify that the teamMint function works as expected.
   */
  describe("Team Mint", function () {
    it("Should mint tokens for the team successfully", async function () {
      await contract.teamMint(10);

      expect(await contract.balanceOf(owner.address)).to.equal(
        BigNumber.from(10)
      );
    });

    it("Should revert teamMint call if caller is not the owner", async function () {
      const tx = contract.connect(addr1).teamMint(10);

      await expect(tx).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should revert teamMint call if it was already called before", async function () {
      await contract.teamMint(1);

      const tx = contract.teamMint(10);

      await expect(tx).to.be.revertedWith("Cannot be called anymore");
    });

    it("Should revert teamMint call if public mint has already started", async function () {
      await contract.toggleSaleStatus();

      await contract.connect(addr1).mint(10, {
        value: price.mul(10),
      });

      const tx = contract.teamMint(1);

      await expect(tx).to.be.revertedWith("Cannot be called anymore");
    });

    it("Should revert teamMint call if number of tokens to mint is set to zero", async function () {
      const tx = contract.teamMint(0);

      await expect(tx).to.be.revertedWith("Invalid mint quantity");
    });

    it("Should revert teamMint call if number of tokens to mint is bigger than 10", async function () {
      const tx = contract.teamMint(11);

      await expect(tx).to.be.revertedWith("Invalid mint quantity");
    });
  });

  /**
   * Read tests.
   * Verify that all the read functions work as expected.
   */
  describe("Read", function () {
    it("Should return a totalSupply equal to zero", async function () {
      expect(await contract.totalSupply()).to.equal(BigNumber.from(0));
    });

    it("Should return the right totalSupply after minting", async function () {
      await contract.toggleSaleStatus();

      await contract.mint(1, {
        value: price,
      });
      await contract.connect(addr1).mint(2, {
        value: price.mul(2),
      });

      expect(await contract.totalSupply()).to.equal(BigNumber.from(3));
    });

    it("Should return the right tokenURIs after minting", async function () {
      await contract.toggleSaleStatus();

      await contract.mint(1, {
        value: price,
      });

      expect(await contract.tokenURI(0)).to.equal(`${baseURI}${0}`);

      await contract.connect(addr1).mint(2, {
        value: price.mul(2),
      });

      expect(await contract.tokenURI(1)).to.equal(`${baseURI}${1}`);
      expect(await contract.tokenURI(2)).to.equal(`${baseURI}${2}`);
    });

    it("Should revert tokenURI call if token is nonexistent", async function () {
      await contract.toggleSaleStatus();

      await contract.mint(2, {
        value: price.mul(2),
      });

      const tx = contract.tokenURI(2);

      await expect(tx).to.be.revertedWith(
        "ERC721Metadata: URI query for nonexistent token"
      );
    });
  });

  /**
   * Transfer & Withdraw tests.
   * Verify that the transfer and withdraw functions work as expected.
   */
  describe("Transfer & Withdraw", function () {
    it("Should transfer profits to the UBIBurner contract successfully", async function () {
      await mockPoH.mock.isRegistered.returns(true);

      await contract.toggleSaleStatus();

      await contract.mint(10, {
        value: price.mul(10),
      });

      await contract.transferToUBIBurner();

      expect(await contract.profitsForUBIBurner()).to.equal(BigNumber.from(0));
      expect(await getBalance(ubiBurner.address)).to.equal(price.mul(10));
    });

    it("Should revert transfer to the UBIBurner contract if there's nothing to transfer", async function () {
      // Only addr1 is registered on PoH
      await mockPoH.mock.isRegistered.withArgs(addr1.address).returns(true);

      await contract.toggleSaleStatus();

      // addr1 mints 10 tokens
      await contract.connect(addr1).mint(10, {
        value: price.mul(10),
      });

      // addr2 mints 5 tokens
      await contract.connect(addr2).mint(5, {
        value: price.mul(5),
      });

      // Transfer 10 to the UBIBurner
      await contract.transferToUBIBurner();

      // Contract balance is 5
      expect(await getBalance(contract.address)).to.equal(price.mul(5));

      // Try to transfer again
      const tx = contract.transferToUBIBurner();
      await expect(tx).to.be.revertedWith("Nothing to transfer");
    });

    it("Should withdraw funds to owner successfully", async function () {
      await contract.toggleSaleStatus();

      const initialOwnerBalance = await getBalance(owner.address);

      await contract.connect(addr1).mint(10, {
        value: price.mul(10),
      });
      await contract.connect(addr2).mint(2, {
        value: price.mul(2),
      });

      const tx = await contract.connect(owner).withdraw();
      const { cumulativeGasUsed } = await tx.wait();
      const txCost = cumulativeGasUsed.mul(tx.gasPrice);

      expect(await getBalance(contract.address)).to.equal(BigNumber.from(0));
      expect(await getBalance(owner.address)).to.equal(
        initialOwnerBalance.sub(txCost).add(price.mul(12))
      );
    });

    it("Should revert withdraw call if caller is not the owner", async function () {
      await contract.toggleSaleStatus();

      await contract.mint(1, {
        value: price,
      });

      const tx = contract.connect(addr1).withdraw();
      await expect(tx).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should revert withdraw call if there are no funds to withdraw", async function () {
      // Only addr1 is registered on PoH
      await mockPoH.mock.isRegistered.withArgs(addr1.address).returns(true);

      await contract.toggleSaleStatus();

      // addr1 mints 10 tokens
      await contract.connect(addr1).mint(10, {
        value: price.mul(10),
      });

      // addr2 mints 5 tokens
      await contract.connect(addr2).mint(5, {
        value: price.mul(5),
      });

      // Withdraw 5 to owner
      await contract.withdraw();

      // Contract balance is 5
      expect(await getBalance(contract.address)).to.equal(price.mul(10));

      // Try to withdraw again
      const tx = contract.withdraw();
      await expect(tx).to.be.revertedWith("Nothing to withdraw");
    });

    it("Should split funds between UBIBurner and the owner correctly", async function () {
      // Only addr1 is registered on PoH
      await mockPoH.mock.isRegistered.withArgs(addr1.address).returns(true);

      await contract.toggleSaleStatus();

      // addr1 mints 5 tokens
      await contract.connect(addr1).mint(5, {
        value: price.mul(5),
      });

      // addr2 mints 10 tokens
      await contract.connect(addr2).mint(10, {
        value: price.mul(10),
      });

      // Contract balance is 15
      expect(await getBalance(contract.address)).to.equal(price.mul(15));
      // Remaning profitsForUBIBurner is 5
      expect(await contract.profitsForUBIBurner()).to.equal(price.mul(5));

      // Transfer 5 to UBIBurner
      await contract.transferToUBIBurner();

      // Contract balance is (15 - 5) => 10
      expect(await getBalance(contract.address)).to.equal(price.mul(10));
      // UBIBurner balance is 5
      expect(await getBalance(ubiBurner.address)).to.equal(price.mul(5));
      // Remaning profitsForUBIBurner is (5 - 5) => 0
      expect(await contract.profitsForUBIBurner()).to.equal(BigNumber.from(0));

      // addr1 mints 2 tokens
      await contract.connect(addr1).mint(2, {
        value: price.mul(2),
      });

      // Contract balance is (10 + 2) => 12
      expect(await getBalance(contract.address)).to.equal(price.mul(12));
      // Remaning profitsForUBIBurner is (0 + 2) => 2
      expect(await contract.profitsForUBIBurner()).to.equal(price.mul(2));

      // Withdraw 10 to owner
      await contract.withdraw();

      // Contract balance is (12 - 10) => 2
      expect(await getBalance(contract.address)).to.equal(price.mul(2));
      // Remaning profitsForUBIBurner is 2
      expect(await contract.profitsForUBIBurner()).to.equal(price.mul(2));

      // Transfer to UBIBurner
      await contract.transferToUBIBurner();

      // Contract balance is (2 - 2) => 0
      expect(await getBalance(contract.address)).to.equal(BigNumber.from(0));
      // UBIBurner balance is (5 + 2) => 7
      expect(await getBalance(ubiBurner.address)).to.equal(price.mul(7));
      // Remaning profitsForUBIBurner is (2 - 2) => 0
      expect(await contract.profitsForUBIBurner()).to.equal(BigNumber.from(0));
    });
  });
});
