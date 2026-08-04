// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice Minimal subset of Flare's FTSO v2 block-latency feed interface.
/// @dev On Coston2 `FtsoV2` resolves to the test interface, where these reads
///      are `view` and free. On mainnet the same selectors exist but may be
///      payable; Tempo only ever needs the free block-latency path.
interface IFtsoV2 {
    /// @param _feedId 21-byte feed identifier, e.g. XRP/USD.
    /// @return _value Price scaled to 18 decimals.
    /// @return _timestamp Unix timestamp of the voting round the value came from.
    function getFeedByIdInWei(bytes21 _feedId) external view returns (uint256 _value, uint64 _timestamp);
}
