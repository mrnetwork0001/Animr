// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC6551RegistryLike} from "./interfaces/External.sol";

interface IChogNftLike {
    function ownerOf(uint256 tokenId) external view returns (address);
}

interface IERC1155ReceiverLike {
    function onERC1155Received(address operator, address from, uint256 id, uint256 value, bytes calldata data)
        external
        returns (bytes4);
}

/// @title AnimrTrophies
/// @notice A Chog's history lives inside the NFT: trophies are minted into the Chog's own ERC-6551 wallet, so when
///         the Chog is sold its trophies go with it.
/// @dev Minimal, non-transferable ERC-1155. Token id = trophy kind; a balance counts how many times a Chog won it.
///      - award() mints exactly 1 to the canonical Tokenbound account of a Chog Genesis token (registry v0.3.1,
///        AccountProxy, salt 0, this chain). The contract derives that address itself, so the minter can only ever
///        mint into real Chog wallets. The account does not have to be deployed yet: a counterfactual address just
///        holds the balance, and once created the account (and whoever owns the NFT) holds it.
///      - Each award has an idempotency key, keccak256(abi.encode(kind, context)), that can be used once. The app
///        passes the UTC day as YYYYMMDD for once-a-day kinds (Best call, Most rekt, Survived a heist) and the Chog's
///        token id for once-per-Chog kinds (First real trade).
///      - Soulbound to the holder address: transfers and approvals revert. The holder is a token-bound account, so
///        trophies follow the NFT when it is sold.
///      - Roles: the owner (two-step transfer) enables kinds, sets the metadata URI and rotates the minter. The minter
///        (the app's operator key) can only award. They can never be the same address.
contract AnimrTrophies {
    // ------------------------------------------------------------- constants

    string public constant name = "Animr Trophies";
    string public constant symbol = "ANIMR-TROPHY";

    uint256 public constant BEST_CALL = 1; // Oracle of the Day: the closest call on a live Daily Bell
    uint256 public constant MOST_REKT = 2; // the furthest call on a live Daily Bell
    uint256 public constant SURVIVED_HEIST = 3; // the House Chog's AI said yes, Monad said no
    uint256 public constant FIRST_TRADE = 4; // the Chog's first real trade through AnimrTradeGuard

    bytes4 private constant ERC1155_RECEIVED = 0xf23a6e61; // onERC1155Received.selector

    // ------------------------------------------------------------ immutables

    address public immutable chogNft;
    address public immutable registry;
    address public immutable accountImplementation;

    // ----------------------------------------------------------------- state

    address public owner;
    address public pendingOwner;
    address public minter;

    /// @notice ERC-1155 balances: holder => kind => count.
    mapping(address holder => mapping(uint256 kind => uint256)) public balanceOf;
    /// @notice Idempotency keys already used (see awardKey).
    mapping(bytes32 key => bool) public awarded;
    /// @notice Kinds the minter may award.
    mapping(uint256 kind => bool) public kindEnabled;
    /// @notice Highest kind ever enabled (for metadata refresh events).
    uint256 public maxKind;

    string private _uri;

    // ---------------------------------------------------------------- events

    event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value);
    event TransferBatch(
        address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values
    );
    event ApprovalForAll(address indexed account, address indexed operator, bool approved);
    event URI(string value, uint256 indexed id);

    /// @notice One trophy minted into `account`, the Tokenbound wallet of Chog `chogId`.
    event TrophyAwarded(
        uint256 indexed chogId, uint256 indexed kind, address indexed account, uint256 context, bytes32 key
    );
    event KindSet(uint256 indexed kind, bool enabled);
    event MinterChanged(address indexed previousMinter, address indexed newMinter);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ---------------------------------------------------------------- errors

    error NotOwner();
    error NotPendingOwner();
    error NotMinter();
    error InvalidMinter();
    error KindDisabled(uint256 kind);
    error AlreadyAwarded(bytes32 key);
    error Soulbound();
    error UnsafeRecipient(address account);
    error LengthMismatch();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @param minter_ The app's operator key. Must not be the deployer (the deployer becomes the owner).
    /// @param uri_ ERC-1155 metadata URI template, e.g. "https://<app>/api/trophies/meta/{id}".
    constructor(address minter_, string memory uri_, address chogNft_, address registry_, address implementation_) {
        if (minter_ == address(0) || minter_ == msg.sender) revert InvalidMinter();
        chogNft = chogNft_;
        registry = registry_;
        accountImplementation = implementation_;
        owner = msg.sender;
        minter = minter_;
        _uri = uri_;
        emit OwnershipTransferred(address(0), msg.sender);
        emit MinterChanged(address(0), minter_);
        for (uint256 kind = BEST_CALL; kind <= FIRST_TRADE; kind++) {
            kindEnabled[kind] = true;
            emit KindSet(kind, true);
        }
        maxKind = FIRST_TRADE;
    }

    // ----------------------------------------------------------------- award

    /// @notice Mints one `kind` trophy into Chog `chogId`'s Tokenbound wallet. Minter only; each (kind, context)
    ///         at most once. Reverts if the Chog does not exist.
    /// @return account The Chog's wallet (deployed or not) that now holds the trophy.
    function award(uint256 chogId, uint256 kind, uint256 context) external returns (address account) {
        if (msg.sender != minter) revert NotMinter();
        if (!kindEnabled[kind]) revert KindDisabled(kind);
        bytes32 key = awardKey(kind, context);
        if (awarded[key]) revert AlreadyAwarded(key);
        IChogNftLike(chogNft).ownerOf(chogId); // reverts for a token that doesn't exist
        account = accountOf(chogId);

        awarded[key] = true;
        unchecked {
            balanceOf[account][kind] += 1; // one per key: can't realistically overflow
        }
        emit TransferSingle(msg.sender, address(0), account, kind, 1);
        emit TrophyAwarded(chogId, kind, account, context, key);

        // ERC-1155 acceptance check, only for a deployed wallet (Tokenbound AccountV3 accepts ERC-1155).
        if (account.code.length != 0) {
            (bool ok, bytes memory ret) = account.call(
                abi.encodeCall(IERC1155ReceiverLike.onERC1155Received, (msg.sender, address(0), kind, 1, ""))
            );
            if (!ok || ret.length < 32 || bytes4(abi.decode(ret, (bytes32))) != ERC1155_RECEIVED) {
                revert UnsafeRecipient(account);
            }
        }
    }

    /// @notice The idempotency key of an award.
    function awardKey(uint256 kind, uint256 context) public pure returns (bytes32) {
        return keccak256(abi.encode(kind, context));
    }

    /// @notice Chog `chogId`'s canonical Tokenbound wallet on this chain.
    function accountOf(uint256 chogId) public view returns (address) {
        return IERC6551RegistryLike(registry).account(accountImplementation, bytes32(0), block.chainid, chogNft, chogId);
    }

    // --------------------------------------------------------------- ERC-1155

    function balanceOfBatch(address[] calldata accounts, uint256[] calldata ids)
        external
        view
        returns (uint256[] memory balances)
    {
        if (accounts.length != ids.length) revert LengthMismatch();
        balances = new uint256[](accounts.length);
        for (uint256 i; i < accounts.length; i++) {
            balances[i] = balanceOf[accounts[i]][ids[i]];
        }
    }

    function uri(uint256) external view returns (string memory) {
        return _uri;
    }

    function isApprovedForAll(address, address) external pure returns (bool) {
        return false;
    }

    function setApprovalForAll(address, bool) external pure {
        revert Soulbound();
    }

    function safeTransferFrom(address, address, uint256, uint256, bytes calldata) external pure {
        revert Soulbound();
    }

    function safeBatchTransferFrom(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
    {
        revert Soulbound();
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == 0x01ffc9a7 // ERC-165
                || interfaceId == 0xd9b67a26 // ERC-1155
                || interfaceId == 0x0e89341c; // ERC-1155 metadata URI
    }

    // ------------------------------------------------------------------ owner

    function setKind(uint256 kind, bool enabled) external onlyOwner {
        kindEnabled[kind] = enabled;
        if (kind > maxKind) maxKind = kind;
        emit KindSet(kind, enabled);
    }

    /// @notice Changes the metadata URI template and tells indexers to refresh every kind.
    function setURI(string calldata newUri) external onlyOwner {
        _uri = newUri;
        for (uint256 kind = 1; kind <= maxKind; kind++) {
            emit URI(newUri, kind);
        }
    }

    /// @notice Rotates (or, with address(0), removes) the minter. The owner can never be the minter.
    function setMinter(address newMinter) external onlyOwner {
        if (newMinter == owner) revert InvalidMinter();
        emit MinterChanged(minter, newMinter);
        minter = newMinter;
    }

    /// @notice Starts a two-step ownership transfer; `newOwner` has to call acceptOwnership(). address(0) cancels.
    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        if (msg.sender == minter) revert InvalidMinter();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }
}
