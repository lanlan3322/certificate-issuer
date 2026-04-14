"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Copy,
  Check,
} from "lucide-react";

interface DeploymentStep {
  step: number;
  title: string;
  description: string;
  action: string;
  link: string;
}

interface DeploymentGuideProps {
  steps: DeploymentStep[];
  documentStoreAddress: string;
  dnsLocation: string;
}

export default function DeploymentGuide({
  steps,
  documentStoreAddress,
  dnsLocation,
}: DeploymentGuideProps) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const dnsRecordValue = `openatts net=ethereum netId=11155111 addr=${documentStoreAddress}`;

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-100">
        <h3 className="text-xl font-bold text-gray-800 flex items-center space-x-2">
          <span className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white text-sm font-bold">
            {steps.length}
          </span>
          <span>Deployment Steps</span>
        </h3>
        <p className="text-gray-600 mt-2 text-sm">
          Follow these steps to deploy your TradeTrust-compliant certificate issuer
        </p>
      </div>

      <div className="divide-y divide-gray-100">
        {steps.map((step) => (
          <div key={step.step} className="group">
            <button
              onClick={() =>
                setExpandedStep(expandedStep === step.step ? null : step.step)
              }
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center space-x-4">
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                    expandedStep === step.step
                      ? "bg-primary text-white"
                      : "bg-gray-100 text-gray-600 group-hover:bg-primary/10 group-hover:text-primary"
                  }`}
                >
                  {step.step}
                </span>
                <div className="text-left">
                  <h4 className="font-semibold text-gray-800">{step.title}</h4>
                  <p className="text-sm text-gray-600 hidden sm:block">
                    {step.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {expandedStep === step.step ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </div>
            </button>

            {expandedStep === step.step && (
              <div className="px-6 pb-6 pt-2 bg-gray-50/50">
                <div className="ml-12 space-y-4">
                  {/* Step 1: Document Store */}
                  {step.step === 1 && (
                    <div className="space-y-3">
                      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <div className="flex items-start space-x-2">
                          <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                          <p className="text-sm text-yellow-800">
                            <strong>Demo Mode:</strong> Using pre-deployed document store.
                            For production, deploy your own contract.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
                        <code className="text-sm font-mono text-gray-600">
                          {documentStoreAddress.slice(0, 20)}...
                        </code>
                        <button
                          onClick={() => handleCopy(documentStoreAddress, "address")}
                          className="flex items-center space-x-1 text-primary hover:text-primary/80"
                        >
                          {copied === "address" ? (
                            <>
                              <Check className="w-4 h-4" />
                              <span className="text-sm">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              <span className="text-sm">Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                      <a
                        href={step.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-2 text-primary hover:underline"
                      >
                        <span>View on Etherscan</span>
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  )}

                  {/* Step 2: DNS Configuration */}
                  {step.step === 2 && (
                    <div className="space-y-3" id="dns-config">
                      <p className="text-sm text-gray-700">
                        Add this TXT record to your DNS to prove domain ownership:
                      </p>
                      <div className="p-4 bg-gray-900 rounded-lg font-mono text-sm">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-gray-400">Name:</span>
                          <span className="text-green-400">
                            _document-store.{dnsLocation}
                          </span>
                        </div>
                        <div className="flex items-start justify-between">
                          <span className="text-gray-400">Value:</span>
                          <div className="flex items-start space-x-2">
                            <span className="text-green-400 max-w-xs break-all">
                              {dnsRecordValue}
                            </span>
                            <button
                              onClick={() => handleCopy(dnsRecordValue, "dns")}
                              className="text-gray-500 hover:text-white transition-colors flex-shrink-0"
                            >
                              {copied === "dns" ? (
                                <Check className="w-4 h-4" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">
                        Wait 5-10 minutes for DNS propagation after adding the record.
                      </p>
                    </div>
                  )}

                  {/* Step 3: Issue Certificates */}
                  {step.step === 3 && (
                    <div className="space-y-3">
                      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-start space-x-2">
                          <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                          <p className="text-sm text-green-800">
                            Ready to issue! Connect your wallet and fill in the form below.
                          </p>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600">
                        Requirements:
                      </p>
                      <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
                        <li>MetaMask wallet with Sepolia ETH</li>
                        <li>Wallet address must be the document store owner</li>
                        <li>Valid recipient information</li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
