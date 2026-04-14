"use client";

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";

// Wallet state
interface WalletState {
  connected: boolean;
  connecting: boolean;
  address: string | null;
  balance: string | null;
  network: string | null;
  error: string | null;
}

declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, callback: (...args: unknown[]) => void) => void;
      removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
      selectedAddress?: string;
      networkVersion?: string;
    };
  }
}

export function useWalletConnection() {
  const [wallet, setWallet] = useState<WalletState>({
    connected: false,
    connecting: false,
    address: null,
    balance: null,
    network: null,
    error: null,
  });

  // Check if MetaMask is installed
  const isMetaMaskInstalled = useCallback(() => {
    return typeof window !== "undefined" && !!window.ethereum?.isMetaMask;
  }, []);

  // Get provider
  const getProvider = useCallback(() => {
    if (!window.ethereum) return null;
    return new ethers.providers.Web3Provider(window.ethereum);
  }, []);

  // Connect wallet
  const connect = useCallback(async () => {
    if (!isMetaMaskInstalled()) {
      setWallet((prev) => ({
        ...prev,
        error: "MetaMask is not installed. Please install MetaMask to continue.",
      }));
      return;
    }

    setWallet((prev) => ({ ...prev, connecting: true, error: null }));

    try {
      const accounts = (await window.ethereum!.request({
        method: "eth_requestAccounts",
      })) as string[];

      if (accounts.length === 0) {
        throw new Error("No accounts found. Please unlock MetaMask.");
      }

      const provider = getProvider()!;
      const signer = provider.getSigner();
      const address = await signer.getAddress();
      const network = (await provider.getNetwork()).name;
      const balance = await provider.getBalance(address);
      const balanceEth = ethers.utils.formatEther(balance);

      setWallet({
        connected: true,
        connecting: false,
        address,
        balance: `${parseFloat(balanceEth).toFixed(4)} ETH`,
        network,
        error: null,
      });
    } catch (err) {
      const error = err as Error;
      setWallet((prev) => ({
        ...prev,
        connecting: false,
        error: error.message || "Failed to connect wallet",
      }));
    }
  }, [isMetaMaskInstalled, getProvider]);

  // Disconnect wallet
  const disconnect = useCallback(() => {
    setWallet({
      connected: false,
      connecting: false,
      address: null,
      balance: null,
      network: null,
      error: null,
    });
  }, []);

  // Get signer (for issuing)
  const getSigner = useCallback(async () => {
    if (!window.ethereum) {
      throw new Error("MetaMask is not installed");
    }
    const provider = getProvider();
    if (!provider) {
      throw new Error("Failed to get provider");
    }
    return provider.getSigner();
  }, [getProvider]);

  // Switch to Sepolia network
  const switchToSepolia = useCallback(async () => {
    if (!window.ethereum) return;

    try {
      // Try switching to Sepolia
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xaa36a7" }], // 11155111 in hex
      });
    } catch (switchError) {
      // If chain doesn't exist, add it
      const error = switchError as { code: number };
      if (error.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0xaa36a7",
              chainName: "Sepolia Testnet",
              nativeCurrency: {
                name: "SepoliaETH",
                symbol: "ETH",
                decimals: 18,
              },
              rpcUrls: ["https://rpc.sepolia.org"],
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            },
          ],
        });
      }
    }
  }, []);

  // Listen for account changes
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;

    const handleAccountsChanged = (accounts: unknown) => {
      const accountsArray = accounts as string[];
      if (accountsArray.length === 0) {
        disconnect();
      } else if (accountsArray[0] !== wallet.address) {
        // Update address
        setWallet((prev) => ({ ...prev, address: accountsArray[0] }));
      }
    };

    const handleChainChanged = () => {
      // Reload to reset state
      window.location.reload();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      }
    };
  }, [wallet.address, disconnect]);

  return {
    ...wallet,
    connect,
    disconnect,
    getSigner,
    switchToSepolia,
    isMetaMaskInstalled,
  };
}
