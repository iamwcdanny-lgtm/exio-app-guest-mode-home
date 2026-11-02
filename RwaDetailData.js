// Token detail content, copied as-is from the EXIO Mobile RWA file
// (Figma 8517:601695, "rwa_inner_full", XAUm). Only XAUm has this content so
// far; other tokens keep the generic detail page.
//
// Note: several Product Elements rows in the Figma frame (Product
// Structuring, Issuing Entity, Underlying Asset, ISIN, the fund roles, the
// Investment Objective / Strategy / Restriction) describe HYBOND, and Risk
// Rating says High while the tag says Medium. They are kept exactly as in
// Figma until the real XAUm content arrives.

export const DETAIL = {
  XAUm: {
    nav: { value: "1.7339", unit: "USD", updated: "Last updated: 20-02-2026" },
    yield: "60%",
    overview:
      "Matrixdock Gold (XAUm) is a commodity-backed ERC-20 token issued by Matrix Mining Limited and managed by Matrixdock, part of the Matrixport Group. Each XAUm represents one troy ounce of 99.99% pure physical gold, stored in reputable vaults primarily in Singapore and Hong Kong. The token is redeemable on a 1:1 basis for physical gold or the USD equivalent in fiat/stablecoins, subject to KYC/AML and minimum redemption requirements.",
    elements: [
      ["Product Name", "Matrixdock Gold"],
      ["Ticker Symbol", "XAUm"],
      [
        "Product Structuring",
        'HYBOND is issued by OED, a Bermuda-registered Segregated Accounts Company ("SAC"), acting on behalf of Segregated Account HYBOND. HYBOND will be fully backed by the BNY Mellon Global Short-Dated High Yield Bond Fund held by the Issuer.',
      ],
      ["Complex Product", "Complex"],
      ["Risk Rating", "High", "risk"],
      ["OTC Trading", "No"],
      ["Retail Eligible", "No (Professional Investors only)"],
      ["Legal Classification", "Security Token"],
      ["Issuing Entity", "OpenEden Digital Limited (OED)"],
      ["Regulator", "Bermuda Monetary Authority (BMA)"],
      ["Underlying Asset", "BNY Mellon Global Short-Dated High Yield Bond Fund"],
      ["Underlying Fund Launch Date", "30-Nov-16"],
      ["ISIN", "IE00BD5CV864"],
      ["Derivative Exposure", "Yes (single-name CDS, FX forwards)"],
      ["Ratings", "Morningstar 5 stars"],
      [
        "Investment Objective",
        'HYBOND is issued by OED, a Bermuda-registered Segregated Accounts Company ("SAC"), acting on behalf of Segregated Account HYBOND. HYBOND will be fully backed by the BNY Mellon Global Short-Dated High Yield Bond Fund held by the Issuer.',
      ],
      [
        "Investment Strategy",
        "The Fund aims to achieve its investment objective by investing the majority of its Net Asset Value, meaning over 50%, in a portfolio of high yielding bonds (i.e. bonds that are considered by the Investment Manager to be under-valued) that generally mature or are expected to mature within 3 years. The remaining assets may be invested in a broad range of cash, liquid or near cash assets. In periods of market uncertainty, the Fund may reduce its allocation in high yielding bonds and invest a majority of its assets in cash, liquid or near cash assets in order to protect the value of the Fund.",
      ],
      [
        "Investment Restriction",
        "The Fund adheres to standard UCITS investment and borrowing restrictions. It invests primarily (>50% NAV) in short-dated high-yield bonds (generally maturing within 3 years). Key limits include: no more than 10% NAV in securities of a single issuer (with exceptions for government/public bodies); maximum 20% in emerging markets debt concentration; up to 10% in non-eligible markets/unlisted securities; and up to 10% in CIS/ETFs. Borrowing is limited to 10% of NAV on a temporary basis. Additional ESG binding exclusions apply (e.g., tobacco, thermal coal, controversial weapons).",
      ],
      ["Underlying Fund Investment Manager", "Insight Investment Management (Global) Limited"],
      ["Sub-Investment Manager", "Insight North America LLC"],
      ["Fund Administrator", "BNY Mellon Fund Services (Ireland) DAC"],
      ["Fund Custodian", "BNY Mellon SA/NV, Dublin Branch"],
      ["Fund Auditor", "Ernst & Young"],
      ["Smart Contract Address", "0x67C312A26695...42Db6", "mono"],
      ["Token Standard / Network", "ERC-20 / Ethereum"],
      ["Smart Contract Audit", "WatchPug"],
      ["Token Custodian", "Coinbase / BitGo / EX.IO"],
      ["Technology Provider", "River Labs Pte. Ltd."],
      ["Token Administrator", "Protege Fund Services Pte. Ltd."],
      ["Off-Chain Registrar", "Yes"],
      ["Financial Year-End", "31 December"],
      ["Official Website", "www.insightinvestment.com", "link"],
    ],
    dealing: [
      ["Base Currency", "USD"],
      ["Settlement Currency", "USD"],
      [
        "Subscription Day",
        "Every Irish bank business day. Cut-off (subscription funds received) is 12:00 Irish time (20:00 HKT). Delayed settlement rolls over to the next subscription day.",
      ],
      [
        "Redemption Day",
        "Every Irish bank business day. Cut-off (redemption request submitted) is 12:00 Irish time (20:00 HKT). Delayed settlement rolls over to the next redemption day.",
      ],
      ["Settlement Period", "Subscription: T+4 (Irish/US business days). Redemption: T+4 (Irish/US business days)."],
      ["Minimum Initial Subscription", "100,000 USDC"],
      ["Minimum Subsequent Subscription", "1 USDC"],
      ["Minimum Holding", "None"],
      ["Minimum Redemption", "None"],
      ["Lock-up Period", "None"],
      ["Redemption Restriction", "Daily redemption is capped at 10% of NAV."],
      ["Valuation Frequency", "Daily"],
      ["Valuation Point", "22:00 Irish time"],
      ["Distribution Policy", "Declared at each month-end; paid by the 20th of the following month."],
      ["Performance Fee", "None"],
      ["Management Fee", "1.00% p.a. (BNY 40bps / OpenEden 60bps)"],
      ["Subscription Fee", "None"],
      ["Minting Fee", "0.05%"],
      ["Redemption Fee", "0.05%"],
      ["Token Deposit / Withdrawal", "Not Allowed"],
      ["Collateral / Guarantee", "None"],
    ],
    // Read off the Figma bar chart (axis 0–3, no unit or series name given).
    performance: [
      ["Q1", 2.02],
      ["Q2", 2.35],
      ["Q3", 2.55],
      ["Q4", 2.15],
    ],
    documents: [
      ["Matrixdock Gold XAUm Whitepaper", "pdf"],
      ["Matrixdock Gold logo pack", "doc"],
      ["Fact Sheet (August 2026)", "pdf"],
    ],
  },
};
