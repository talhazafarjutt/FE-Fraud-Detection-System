/**
 * Layer payloads for the console tests, captured from the local API as
 * supervisor@example.com on 2026-10-04/05.
 *
 * WIRE_*_CORE / WIRE_META_OFF / WIRE_TRANSACTION: layer OFF.
 * Everything else: layer ON (`LAYERS=civitas_islamic`, synthetic Islamic book
 * ISL-0001..ISL-0158). Regenerate by repeating the call named on each constant.
 */

/** GET /v1/meta, layer off. */
export const WIRE_META_OFF = {
  layers: [],
  typologies: ['MULE_RING', 'STRUCTURING', 'ACCOUNT_TAKEOVER', 'INVOICE_REDIRECTION', 'LAYERING'],
  products: [],
};

/** GET /v1/fraud-alerts/{id}, layer off (events, explanation and network trimmed). */
export const WIRE_ALERT_DETAIL_CORE = {
  id: '4d718169-552a-4812-ab00-adb9f4696b3f',
  transaction_id: 'ee0394bf-15a2-4cf1-8ae2-9b805c52f5e3',
  score_id: '115de68d-00a4-4992-95dc-b57cb4e80c8a',
  case_id: '2327025d-d59a-4a69-a639-444a9fe200dc',
  status: 'FALSE_POSITIVE',
  severity: 'HIGH',
  risk_score: 73.57993769645691,
  team: 'team-alpha',
  assigned_to: null,
  opened_at: '2026-10-04T18:50:50.181475Z',
  closed_at: '2026-10-04T18:51:36.184687Z',
  amount: null,
  currency: null,
  provenance: {
    transaction_id: 'ee0394bf-15a2-4cf1-8ae2-9b805c52f5e3',
    score_id: '115de68d-00a4-4992-95dc-b57cb4e80c8a',
    alert_id: '4d718169-552a-4812-ab00-adb9f4696b3f',
    model_name: 'xgboost-paysim',
    model_version: '1.0.0',
    risk_engine_version: '2.0.0',
    scored_at: '2026-10-04T18:50:50.174817Z',
  },
  events: [
    {
      id: '1efdc039-b2af-44ca-be3e-40cccc8bebc0',
      from_status: null,
      to_status: 'OPEN',
      note: 'auto-opened by xgboost-paysim@1.0.0 score_id=115de68d-00a4-4992-95dc-b57cb4e80c8a',
      actor_user_id: null,
      created_at: '2026-10-04T18:50:50.183267Z',
    },
  ],
  explanation: [],
  model_name: 'xgboost-paysim',
  model_version: '1.0.0',
  model_decision: null,
  risk_engine_version: '2.0.0',
  signals: {
    rule_score: 100.0,
    model_score: 67.63322949409485,
    anomaly_score: 80.0,
    network_score: 0.0,
    weighted_score: 73.57993769645691,
    rule_floor_applied: false,
  },
  triggered_rules: [
    {
      rule: 'ORIGIN_ACCOUNT_DRAIN',
      severity: 'HIGH',
      description: 'The TRANSFER amount of 30,000.00 is within 1.0% of the origin balance of 30,050.00.',
    },
  ],
  network: null,
  anomaly: { threshold: 1.0, is_anomaly: false, anomaly_score: 0.8 },
  decision_reasons: [
    {
      code: 'ORIGIN_ACCOUNT_DRAIN',
      source: 'RULE',
      description: 'The TRANSFER amount of 30,000.00 is within 1.0% of the origin balance of 30,050.00.',
    },
  ],
  layer_findings: null,
  feedback: null,
};

/** GET /v1/transactions/{id} for the alert above. */
export const WIRE_TRANSACTION = {
  id: 'ee0394bf-15a2-4cf1-8ae2-9b805c52f5e3',
  external_ref: 'E2E-120BB5-W5',
  amount: '30000.00',
  currency: 'AED',
  booked_at: '2026-10-04T18:50:49.565061Z',
  transaction_type: 'TRANSFER',
  mcc: null,
  sender_balance_before: '30050.00',
  receiver_balance_before: '1500.00',
  scoring_status: 'COMPLETE',
  src_account_last4: '4555',
  dst_account_last4: '9145',
  src_account_id: '98d91f74-48da-4c62-802f-98e0256340ff',
  dst_account_id: '3e838d6c-b4b5-45da-b9c1-7738922d77f8',
};

/* ------------------------------------------------------------------ *
 * Layer on.
 * ------------------------------------------------------------------ */

/** GET /v1/meta. */
export const WIRE_META_ON = {
  layers: [
    "islamic"
  ],
  typologies: [
    "MULE_RING",
    "STRUCTURING",
    "ACCOUNT_TAKEOVER",
    "INVOICE_REDIRECTION",
    "LAYERING",
    "MURABAHA_FICTITIOUS_ASSET",
    "THIRD_PARTY_REPAYMENT",
    "SETTLEMENT_LAUNDERING",
    "COMMODITY_ROUND_TRIP",
    "TAKAFUL_CLAIM_FRAUD",
    "CHARITY_DIVERSION"
  ],
  products: [
    {
      layer: "islamic",
      code: "MURABAHA",
      label: "Murabaha",
      events: [
        "DISBURSEMENT",
        "INSTALMENT",
        "EARLY_SETTLEMENT",
        "ASSET_SALE"
      ]
    },
    {
      layer: "islamic",
      code: "IJARA",
      label: "Ijara",
      events: [
        "DISBURSEMENT",
        "RENTAL",
        "EARLY_SETTLEMENT"
      ]
    },
    {
      layer: "islamic",
      code: "MUSHARAKA",
      label: "Musharaka",
      events: [
        "DISBURSEMENT",
        "INSTALMENT",
        "EARLY_SETTLEMENT",
        "PROFIT_DISTRIBUTION"
      ]
    },
    {
      layer: "islamic",
      code: "MUDARABA",
      label: "Mudaraba",
      events: [
        "DISBURSEMENT",
        "PROFIT_DISTRIBUTION"
      ]
    },
    {
      layer: "islamic",
      code: "SUKUK",
      label: "Sukuk",
      events: [
        "PROFIT_DISTRIBUTION"
      ]
    },
    {
      layer: "islamic",
      code: "TAKAFUL",
      label: "Takaful",
      events: [
        "CONTRIBUTION",
        "CLAIM"
      ]
    },
    {
      layer: "islamic",
      code: "QARD_HASAN",
      label: "Qard Hasan",
      events: [
        "DISBURSEMENT",
        "INSTALMENT",
        "EARLY_SETTLEMENT"
      ]
    },
    {
      layer: "islamic",
      code: "ZAKAT",
      label: "Zakat",
      events: [
        "CHARITY"
      ]
    }
  ]
};

/** GET /v1/islamic/summary. */
export const WIRE_SUMMARY = {
  products: [
    {
      product: "MURABAHA",
      label: "Murabaha",
      transactions: 56,
      alerts: 6,
      set_aside: 10,
      confirmed_fraud: 1,
      false_positive: 0
    },
    {
      product: "IJARA",
      label: "Ijara",
      transactions: 22,
      alerts: 1,
      set_aside: 10,
      confirmed_fraud: 1,
      false_positive: 0
    },
    {
      product: "MUSHARAKA",
      label: "Musharaka",
      transactions: 6,
      alerts: 0,
      set_aside: 0,
      confirmed_fraud: 0,
      false_positive: 0
    },
    {
      product: "MUDARABA",
      label: "Mudaraba",
      transactions: 3,
      alerts: 0,
      set_aside: 0,
      confirmed_fraud: 0,
      false_positive: 0
    },
    {
      product: "SUKUK",
      label: "Sukuk",
      transactions: 8,
      alerts: 0,
      set_aside: 4,
      confirmed_fraud: 0,
      false_positive: 0
    },
    {
      product: "TAKAFUL",
      label: "Takaful",
      transactions: 20,
      alerts: 2,
      set_aside: 0,
      confirmed_fraud: 1,
      false_positive: 0
    },
    {
      product: "QARD_HASAN",
      label: "Qard Hasan",
      transactions: 6,
      alerts: 0,
      set_aside: 0,
      confirmed_fraud: 0,
      false_positive: 0
    },
    {
      product: "ZAKAT",
      label: "Zakat",
      transactions: 15,
      alerts: 3,
      set_aside: 0,
      confirmed_fraud: 0,
      false_positive: 0
    }
  ],
  rules: [
    {
      rule: "MURABAHA_SUPPLIER_MISMATCH",
      kind: "added",
      count: 2
    },
    {
      rule: "THIRD_PARTY_REPAYMENT",
      kind: "added",
      count: 2
    },
    {
      rule: "SETTLEMENT_FUNDED_BY_FAN_IN",
      kind: "added",
      count: 1
    },
    {
      rule: "COMMODITY_ROUND_TRIP",
      kind: "added",
      count: 1
    },
    {
      rule: "TAKAFUL_EARLY_CLAIM",
      kind: "added",
      count: 2
    },
    {
      rule: "CHARITY_DIVERSION",
      kind: "added",
      count: 3
    },
    {
      rule: "CONTRACT_INCOHERENT",
      kind: "added",
      count: 2
    },
    {
      rule: "ORIGIN_ACCOUNT_DRAIN",
      kind: "set_aside",
      count: 8
    },
    {
      rule: "ROUND_AMOUNT_BURST",
      kind: "set_aside",
      count: 16
    }
  ]
};

/**
 * GET /v1/fraud-alerts?limit=200, reduced to the 12 Islamic rows plus two core
 * rows (whose `layer_facts` is null).
 */
export const WIRE_ALERT_PAGE = {
  items: [
    {
      id: "650a0f2b-230e-4834-aa8b-a1b936aa83bb",
      transaction_id: "f438194f-38c3-4193-95d7-d10912aec155",
      score_id: "689db502-5b15-46cb-9e4c-ae04f4dcb45d",
      case_id: "c6e722f8-8328-4f91-a186-089be755a74c",
      status: "OPEN",
      severity: "HIGH",
      risk_score: 70.0,
      team: "team-alpha",
      assigned_to: null,
      opened_at: "2026-10-05T01:08:52.150641Z",
      closed_at: null,
      amount: "309205.10",
      currency: "AED",
      provenance: {
        transaction_id: "f438194f-38c3-4193-95d7-d10912aec155",
        score_id: "689db502-5b15-46cb-9e4c-ae04f4dcb45d",
        alert_id: "650a0f2b-230e-4834-aa8b-a1b936aa83bb",
        model_name: "xgboost-paysim",
        model_version: "1.0.0",
        risk_engine_version: "2.0.0",
        scored_at: "2026-10-05T01:08:52.145465Z"
      },
      layer_facts: {
        islamic: {
          event: "EARLY_SETTLEMENT",
          tenor: 48,
          product: "MURABAHA",
          contract_id: "MUR-0079",
          instalment_no: 10
        }
      }
    },
    {
      id: "60ce21b7-f8c0-4f16-a3d3-a2adeab2f595",
      transaction_id: "ab40341c-f4e3-4946-ac6d-72644ba6a771",
      score_id: "5f328355-679e-4d3d-85ae-76304e81cc24",
      case_id: "16e7419f-162d-4d11-b0b3-939a3504fb47",
      status: "OPEN",
      severity: "HIGH",
      risk_score: 70.0,
      team: "team-beta",
      assigned_to: null,
      opened_at: "2026-10-05T01:08:52.061551Z",
      closed_at: null,
      amount: "4500.00",
      currency: "AED",
      provenance: {
        transaction_id: "ab40341c-f4e3-4946-ac6d-72644ba6a771",
        score_id: "5f328355-679e-4d3d-85ae-76304e81cc24",
        alert_id: "60ce21b7-f8c0-4f16-a3d3-a2adeab2f595",
        model_name: "xgboost-paysim",
        model_version: "1.0.0",
        risk_engine_version: "2.0.0",
        scored_at: "2026-10-05T01:08:52.057102Z"
      },
      layer_facts: {
        islamic: {
          event: "CHARITY",
          tenor: null,
          product: "ZAKAT",
          contract_id: null,
          instalment_no: null
        }
      }
    },
    {
      id: "0a538859-241b-4f3a-bb00-9cd0cfbcb79c",
      transaction_id: "f680900c-9e84-4589-943a-79108fb23dfd",
      score_id: "ddaca5a0-f5e2-4dc2-aa91-41ec14d9cb74",
      case_id: "83367153-6067-4ea2-8847-77070bdefbad",
      status: "OPEN",
      severity: "HIGH",
      risk_score: 80.32016682624817,
      team: "team-alpha",
      assigned_to: null,
      opened_at: "2026-10-05T01:08:51.351870Z",
      closed_at: null,
      amount: "126542.47",
      currency: "AED",
      provenance: {
        transaction_id: "f680900c-9e84-4589-943a-79108fb23dfd",
        score_id: "ddaca5a0-f5e2-4dc2-aa91-41ec14d9cb74",
        alert_id: "0a538859-241b-4f3a-bb00-9cd0cfbcb79c",
        model_name: "xgboost-paysim",
        model_version: "1.0.0",
        risk_engine_version: "2.0.0",
        scored_at: "2026-10-05T01:08:51.347605Z"
      },
      layer_facts: {
        islamic: {
          event: "EARLY_SETTLEMENT",
          tenor: 60,
          product: "MURABAHA",
          contract_id: "MUR-0075",
          instalment_no: 31
        }
      }
    },
    {
      id: "a8634079-754a-45b8-a5b3-c4d42237663a",
      transaction_id: "914ae712-883b-4a06-b231-a9b468f0b317",
      score_id: "e4d3da14-9386-4afd-bd37-ccaa2681f854",
      case_id: "943c7721-d352-41cf-b060-21e835cd3485",
      status: "OPEN",
      severity: "HIGH",
      risk_score: 70.0,
      team: "team-beta",
      assigned_to: null,
      opened_at: "2026-10-05T01:08:50.794415Z",
      closed_at: null,
      amount: "227396.01",
      currency: "AED",
      provenance: {
        transaction_id: "914ae712-883b-4a06-b231-a9b468f0b317",
        score_id: "e4d3da14-9386-4afd-bd37-ccaa2681f854",
        alert_id: "a8634079-754a-45b8-a5b3-c4d42237663a",
        model_name: "xgboost-paysim",
        model_version: "1.0.0",
        risk_engine_version: "2.0.0",
        scored_at: "2026-10-05T01:08:50.790655Z"
      },
      layer_facts: {
        islamic: {
          event: "ASSET_SALE",
          tenor: null,
          product: "MURABAHA",
          contract_id: "MUR-0076",
          instalment_no: null
        }
      }
    },
    {
      id: "2c71e9e0-1f7c-4a17-a1e8-dcb60ab1393c",
      transaction_id: "e6f3d871-8c7d-49e0-a078-eb8df63534f2",
      score_id: "e476e0d7-06be-4ae7-853f-498b5b882c6e",
      case_id: "16e7419f-162d-4d11-b0b3-939a3504fb47",
      status: "OPEN",
      severity: "MEDIUM",
      risk_score: 30.0,
      team: "team-beta",
      assigned_to: null,
      opened_at: "2026-10-05T01:08:50.632853Z",
      closed_at: null,
      amount: "7500.00",
      currency: "AED",
      provenance: {
        transaction_id: "e6f3d871-8c7d-49e0-a078-eb8df63534f2",
        score_id: "e476e0d7-06be-4ae7-853f-498b5b882c6e",
        alert_id: "2c71e9e0-1f7c-4a17-a1e8-dcb60ab1393c",
        model_name: "xgboost-paysim",
        model_version: "1.0.0",
        risk_engine_version: "2.0.0",
        scored_at: "2026-10-05T01:08:50.628167Z"
      },
      layer_facts: {
        islamic: {
          event: "CHARITY",
          tenor: null,
          product: "ZAKAT",
          contract_id: null,
          instalment_no: null
        }
      }
    },
    {
      id: "ef2c69fe-1cc9-4572-a655-891144b7acc4",
      transaction_id: "d2e8add7-b0c0-4567-b594-1cb393b0a661",
      score_id: "911b6353-2930-494f-b86d-f29a22cca634",
      case_id: "16e7419f-162d-4d11-b0b3-939a3504fb47",
      status: "OPEN",
      severity: "MEDIUM",
      risk_score: 30.0,
      team: "team-beta",
      assigned_to: null,
      opened_at: "2026-10-05T01:08:49.159725Z",
      closed_at: null,
      amount: "6000.00",
      currency: "AED",
      provenance: {
        transaction_id: "d2e8add7-b0c0-4567-b594-1cb393b0a661",
        score_id: "911b6353-2930-494f-b86d-f29a22cca634",
        alert_id: "ef2c69fe-1cc9-4572-a655-891144b7acc4",
        model_name: "xgboost-paysim",
        model_version: "1.0.0",
        risk_engine_version: "2.0.0",
        scored_at: "2026-10-05T01:08:49.155214Z"
      },
      layer_facts: {
        islamic: {
          event: "CHARITY",
          tenor: null,
          product: "ZAKAT",
          contract_id: null,
          instalment_no: null
        }
      }
    },
    {
      id: "9c6b1606-58c5-43ce-80c7-21fa7a50ddf8",
      transaction_id: "3383c949-7d24-4d6c-b6d5-ade5355cae4f",
      score_id: "f944eb9e-d326-4d60-84a1-9dc21471f1af",
      case_id: "dda8bee1-d5bf-4b58-8ade-17d00133149f",
      status: "OPEN",
      severity: "HIGH",
      risk_score: 70.0,
      team: "team-beta",
      assigned_to: null,
      opened_at: "2026-10-05T01:08:48.731758Z",
      closed_at: null,
      amount: "48144.63",
      currency: "AED",
      provenance: {
        transaction_id: "3383c949-7d24-4d6c-b6d5-ade5355cae4f",
        score_id: "f944eb9e-d326-4d60-84a1-9dc21471f1af",
        alert_id: "9c6b1606-58c5-43ce-80c7-21fa7a50ddf8",
        model_name: "xgboost-paysim",
        model_version: "1.0.0",
        risk_engine_version: "2.0.0",
        scored_at: "2026-10-05T01:08:48.723339Z"
      },
      layer_facts: {
        islamic: {
          event: "CLAIM",
          tenor: null,
          product: "TAKAFUL",
          contract_id: "TKF-0078",
          instalment_no: null
        }
      }
    },
    {
      id: "bc60a52f-c6cd-477b-b7d8-e5174afcbfb5",
      transaction_id: "4d446a94-d9f7-4717-9c20-51cd7ac60266",
      score_id: "5d654b84-fd8b-4dc8-b11d-201316d2e11c",
      case_id: "15c3d5f9-d7f1-4ca6-9488-349f001fd65f",
      status: "CONFIRMED_FRAUD",
      severity: "HIGH",
      risk_score: 70.0,
      team: "team-alpha",
      assigned_to: null,
      opened_at: "2026-10-05T01:08:47.825262Z",
      closed_at: "2026-10-05T01:08:52.323282Z",
      amount: "46784.48",
      currency: "AED",
      provenance: {
        transaction_id: "4d446a94-d9f7-4717-9c20-51cd7ac60266",
        score_id: "5d654b84-fd8b-4dc8-b11d-201316d2e11c",
        alert_id: "bc60a52f-c6cd-477b-b7d8-e5174afcbfb5",
        model_name: "xgboost-paysim",
        model_version: "1.0.0",
        risk_engine_version: "2.0.0",
        scored_at: "2026-10-05T01:08:47.820703Z"
      },
      layer_facts: {
        islamic: {
          event: "CLAIM",
          tenor: null,
          product: "TAKAFUL",
          contract_id: "TKF-0077",
          instalment_no: null
        }
      }
    },
    {
      id: "2e64f3a3-6634-4422-a2b1-e554a30f9823",
      transaction_id: "ca90fad6-37b8-43f8-a54c-6759ec88e413",
      score_id: "9fc8a280-f106-4255-810a-dcc7aba3f823",
      case_id: "04ca1685-561c-4066-948c-5a73915dd256",
      status: "OPEN",
      severity: "HIGH",
      risk_score: 70.0,
      team: "team-beta",
      assigned_to: null,
      opened_at: "2026-10-05T01:08:47.315249Z",
      closed_at: null,
      amount: "6447.41",
      currency: "AED",
      provenance: {
        transaction_id: "ca90fad6-37b8-43f8-a54c-6759ec88e413",
        score_id: "9fc8a280-f106-4255-810a-dcc7aba3f823",
        alert_id: "2e64f3a3-6634-4422-a2b1-e554a30f9823",
        model_name: "xgboost-paysim",
        model_version: "1.0.0",
        risk_engine_version: "2.0.0",
        scored_at: "2026-10-05T01:08:47.306508Z"
      },
      layer_facts: {
        islamic: {
          event: "INSTALMENT",
          tenor: 48,
          product: "MURABAHA",
          contract_id: "MUR-0073",
          instalment_no: 23
        }
      }
    },
    {
      id: "c7800bdf-2c5c-4b71-af98-6de9d1b7ea23",
      transaction_id: "d7a43400-25c1-4d22-bd6b-135d97a3637e",
      score_id: "576e250e-7c9c-4eee-ad58-0d1438f644b8",
      case_id: "66a11321-a4e6-4b31-bddb-857790c9918f",
      status: "OPEN",
      severity: "HIGH",
      risk_score: 70.0,
      team: "team-alpha",
      assigned_to: null,
      opened_at: "2026-10-05T01:08:46.301919Z",
      closed_at: null,
      amount: "256775.23",
      currency: "AED",
      provenance: {
        transaction_id: "d7a43400-25c1-4d22-bd6b-135d97a3637e",
        score_id: "576e250e-7c9c-4eee-ad58-0d1438f644b8",
        alert_id: "c7800bdf-2c5c-4b71-af98-6de9d1b7ea23",
        model_name: "xgboost-paysim",
        model_version: "1.0.0",
        risk_engine_version: "2.0.0",
        scored_at: "2026-10-05T01:08:46.297596Z"
      },
      layer_facts: {
        islamic: {
          event: "DISBURSEMENT",
          tenor: 60,
          product: "MURABAHA",
          contract_id: "MUR-0071",
          instalment_no: null
        }
      }
    },
    {
      id: "21c25d3c-f000-4cde-8d32-9e14a0f960a2",
      transaction_id: "3613d9fd-c58b-4f35-965c-b3400e962ed6",
      score_id: "f58283b8-3abe-43a7-bab2-433573c484bf",
      case_id: "c9c8b008-54b7-432e-9678-6e758c9e0edb",
      status: "CONFIRMED_FRAUD",
      severity: "HIGH",
      risk_score: 70.0,
      team: "team-beta",
      assigned_to: null,
      opened_at: "2026-10-05T01:08:45.788898Z",
      closed_at: "2026-10-05T01:08:52.279288Z",
      amount: "395286.12",
      currency: "AED",
      provenance: {
        transaction_id: "3613d9fd-c58b-4f35-965c-b3400e962ed6",
        score_id: "f58283b8-3abe-43a7-bab2-433573c484bf",
        alert_id: "21c25d3c-f000-4cde-8d32-9e14a0f960a2",
        model_name: "xgboost-paysim",
        model_version: "1.0.0",
        risk_engine_version: "2.0.0",
        scored_at: "2026-10-05T01:08:45.783690Z"
      },
      layer_facts: {
        islamic: {
          event: "DISBURSEMENT",
          tenor: 36,
          product: "MURABAHA",
          contract_id: "MUR-0072",
          instalment_no: null
        }
      }
    },
    {
      id: "bcb4d3a0-54db-469e-8e45-a4fe9391b680",
      transaction_id: "13037604-7273-4179-b685-f13b07c875ea",
      score_id: "d097183a-c602-4b6a-b7c0-66e9bf3e95a0",
      case_id: "1f9e2a25-f8f7-44c3-98d7-d2b3f07651c9",
      status: "CONFIRMED_FRAUD",
      severity: "HIGH",
      risk_score: 70.0,
      team: "team-alpha",
      assigned_to: null,
      opened_at: "2026-10-05T01:08:44.514811Z",
      closed_at: "2026-10-05T01:08:52.310054Z",
      amount: "3900.60",
      currency: "AED",
      provenance: {
        transaction_id: "13037604-7273-4179-b685-f13b07c875ea",
        score_id: "d097183a-c602-4b6a-b7c0-66e9bf3e95a0",
        alert_id: "bcb4d3a0-54db-469e-8e45-a4fe9391b680",
        model_name: "xgboost-paysim",
        model_version: "1.0.0",
        risk_engine_version: "2.0.0",
        scored_at: "2026-10-05T01:08:44.497137Z"
      },
      layer_facts: {
        islamic: {
          event: "RENTAL",
          tenor: 48,
          product: "IJARA",
          contract_id: "IJR-0074",
          instalment_no: 16
        }
      }
    },
    {
      id: "52ace5c6-e6bc-4e80-baf8-0c19d7f66c24",
      transaction_id: "76b80b0f-7452-4251-998f-5b61bbd1123c",
      score_id: "6b499071-a46b-41d9-bd5f-641c7e583769",
      case_id: "83367153-6067-4ea2-8847-77070bdefbad",
      status: "OPEN",
      severity: "MEDIUM",
      risk_score: 30.0,
      team: "team-alpha",
      assigned_to: null,
      opened_at: "2026-10-05T01:08:51.296890Z",
      closed_at: null,
      amount: "22844.31",
      currency: "AED",
      provenance: {
        transaction_id: "76b80b0f-7452-4251-998f-5b61bbd1123c",
        score_id: "6b499071-a46b-41d9-bd5f-641c7e583769",
        alert_id: "52ace5c6-e6bc-4e80-baf8-0c19d7f66c24",
        model_name: "xgboost-paysim",
        model_version: "1.0.0",
        risk_engine_version: "2.0.0",
        scored_at: "2026-10-05T01:08:51.282818Z"
      },
      layer_facts: null
    },
    {
      id: "920b1f11-cd8c-4a6c-bb5a-4f783da040c0",
      transaction_id: "98dcd9b0-fdb1-4822-8996-9a7f5dd49a76",
      score_id: "503bc94c-7aa8-4833-84be-73b910ce5f28",
      case_id: "83367153-6067-4ea2-8847-77070bdefbad",
      status: "OPEN",
      severity: "MEDIUM",
      risk_score: 30.0,
      team: "team-alpha",
      assigned_to: null,
      opened_at: "2026-10-05T01:08:50.879514Z",
      closed_at: null,
      amount: "23209.72",
      currency: "AED",
      provenance: {
        transaction_id: "98dcd9b0-fdb1-4822-8996-9a7f5dd49a76",
        score_id: "503bc94c-7aa8-4833-84be-73b910ce5f28",
        alert_id: "920b1f11-cd8c-4a6c-bb5a-4f783da040c0",
        model_name: "xgboost-paysim",
        model_version: "1.0.0",
        risk_engine_version: "2.0.0",
        scored_at: "2026-10-05T01:08:50.875733Z"
      },
      layer_facts: null
    }
  ],
  next_cursor: null,
  page_size: 200
};

/**
 * GET /v1/fraud-alerts/{id}: a Murabaha instalment paid by a third party
 * (THIRD_PARTY_REPAYMENT added, 6 -> 70). `explanation` emptied.
 */
export const WIRE_ALERT_DETAIL_ISLAMIC = {
  id: "2e64f3a3-6634-4422-a2b1-e554a30f9823",
  transaction_id: "ca90fad6-37b8-43f8-a54c-6759ec88e413",
  score_id: "9fc8a280-f106-4255-810a-dcc7aba3f823",
  case_id: "04ca1685-561c-4066-948c-5a73915dd256",
  status: "OPEN",
  severity: "HIGH",
  risk_score: 70.0,
  team: "team-beta",
  assigned_to: null,
  opened_at: "2026-10-05T01:08:47.315249Z",
  closed_at: null,
  amount: null,
  currency: null,
  provenance: {
    transaction_id: "ca90fad6-37b8-43f8-a54c-6759ec88e413",
    score_id: "9fc8a280-f106-4255-810a-dcc7aba3f823",
    alert_id: "2e64f3a3-6634-4422-a2b1-e554a30f9823",
    model_name: "xgboost-paysim",
    model_version: "1.0.0",
    risk_engine_version: "2.0.0",
    scored_at: "2026-10-05T01:08:47.306508Z"
  },
  layer_facts: {
    islamic: {
      event: "INSTALMENT",
      tenor: 48,
      product: "MURABAHA",
      contract_id: "MUR-0073",
      instalment_no: 23
    }
  },
  events: [
    {
      id: "3a454f81-0bfe-4d52-902c-b9bf2a180422",
      from_status: null,
      to_status: "OPEN",
      note: "auto-opened by xgboost-paysim@1.0.0 score_id=9fc8a280-f106-4255-810a-dcc7aba3f823",
      actor_user_id: null,
      created_at: "2026-10-05T01:08:47.319675Z"
    }
  ],
  explanation: [],
  model_name: "xgboost-paysim",
  model_version: "1.0.0",
  model_decision: null,
  risk_engine_version: "2.0.0",
  signals: {
    rule_score: 100.0,
    model_score: 0.018451466166879982,
    anomaly_score: 60.0,
    network_score: 0.0,
    weighted_score: 31.011070879700128,
    rule_floor_applied: true
  },
  triggered_rules: [
    {
      rule: "THIRD_PARTY_REPAYMENT",
      source: "islamic",
      severity: "HIGH",
      description: "Murabaha instalment for contract MUR-0073 is paid from an account other than the customer's."
    }
  ],
  network: {
    evidence: [],
    indicators: {
      sender_is_new: 1.0,
      component_size: 2.0,
      sender_fan_out: 1.0,
      receiver_fan_in: 1.0,
      receiver_is_new: 1.0,
      closes_short_cycle: 0.0,
      pass_through_ratio: 0.0,
      repeated_pair_count: 1.0,
      new_account_high_value: 0.0,
      sender_outgoing_volume: 6447.41
    },
    neighborhood: {
      edges: [
        {
          amount: 6447.41,
          source: "5bd9ec42-4fe0-4796-bbe3-26847be9135b",
          target: "18abaf97-ec0c-4eb8-9f02-fe1d2f8a9c23",
          timestamp: "2026-10-05T00:32:56.781204Z",
          transaction_id: "ca90fad6-37b8-43f8-a54c-6759ec88e413"
        }
      ],
      nodes: [
        {
          id: "18abaf97-ec0c-4eb8-9f02-fe1d2f8a9c23",
          label: "Synthetic Islamic Bank"
        },
        {
          id: "5bd9ec42-4fe0-4796-bbe3-26847be9135b",
          label: "Payer 0124"
        }
      ]
    },
    network_score: 0.0
  },
  anomaly: {
    threshold: 1.0,
    is_anomaly: false,
    anomaly_score: 0.6
  },
  decision_reasons: [
    {
      code: "type_PAYMENT",
      source: "MODEL",
      description: "The transaction type was PAYMENT, which reduced the model's fraud risk."
    },
    {
      code: "oldbalanceDest",
      source: "MODEL",
      description: "The destination account balance of 25,000,000.00 reduced the model's fraud risk."
    },
    {
      code: "amount",
      source: "MODEL",
      description: "The transaction amount of 6,447.41 reduced the model's fraud risk."
    },
    {
      code: "THIRD_PARTY_REPAYMENT",
      source: "RULE",
      description: "Murabaha instalment for contract MUR-0073 is paid from an account other than the customer's."
    }
  ],
  layer_findings: {
    islamic: {
      added: [
        {
          rule: "THIRD_PARTY_REPAYMENT",
          source: "islamic",
          severity: "HIGH",
          description: "Murabaha instalment for contract MUR-0073 is paid from an account other than the customer's."
        }
      ],
      facts: {
        event: "INSTALMENT",
        tenor: 48,
        product: "MURABAHA",
        contract_id: "MUR-0073",
        instalment_no: 23
      },
      set_aside: [],
      score_after: 70.0,
      score_before: 6.011070879700128
    }
  },
  feedback: null
};

/** GET /v1/transactions/{id} for the alert above. */
export const WIRE_TRANSACTION_ISLAMIC = {
  id: "ca90fad6-37b8-43f8-a54c-6759ec88e413",
  external_ref: "ISL-0065",
  amount: "6447.41",
  currency: "AED",
  booked_at: "2026-10-05T00:32:56.781204Z",
  transaction_type: "PAYMENT",
  mcc: null,
  sender_balance_before: "8381.63",
  receiver_balance_before: "25000000.00",
  scoring_status: "COMPLETE",
  src_account_last4: "6215",
  dst_account_last4: "7330",
  src_account_id: "5bd9ec42-4fe0-4796-bbe3-26847be9135b",
  dst_account_id: "18abaf97-ec0c-4eb8-9f02-fe1d2f8a9c23"
};

/**
 * GET /v1/fraud-alerts/{id}: an early Takaful claim. One engine rule
 * (NIGHT_HIGH_VALUE, no source) and one layer rule. `explanation` emptied.
 */
export const WIRE_ALERT_DETAIL_CLAIM = {
  id: "bc60a52f-c6cd-477b-b7d8-e5174afcbfb5",
  transaction_id: "4d446a94-d9f7-4717-9c20-51cd7ac60266",
  score_id: "5d654b84-fd8b-4dc8-b11d-201316d2e11c",
  case_id: "15c3d5f9-d7f1-4ca6-9488-349f001fd65f",
  status: "CONFIRMED_FRAUD",
  severity: "HIGH",
  risk_score: 70.0,
  team: "team-alpha",
  assigned_to: null,
  opened_at: "2026-10-05T01:08:47.825262Z",
  closed_at: "2026-10-05T01:08:52.323282Z",
  amount: null,
  currency: null,
  provenance: {
    transaction_id: "4d446a94-d9f7-4717-9c20-51cd7ac60266",
    score_id: "5d654b84-fd8b-4dc8-b11d-201316d2e11c",
    alert_id: "bc60a52f-c6cd-477b-b7d8-e5174afcbfb5",
    model_name: "xgboost-paysim",
    model_version: "1.0.0",
    risk_engine_version: "2.0.0",
    scored_at: "2026-10-05T01:08:47.820703Z"
  },
  layer_facts: {
    islamic: {
      event: "CLAIM",
      tenor: null,
      product: "TAKAFUL",
      contract_id: "TKF-0077",
      instalment_no: null
    }
  },
  events: [
    {
      id: "7622e117-ed03-44bb-be35-edd3f28a5863",
      from_status: null,
      to_status: "OPEN",
      note: "auto-opened by xgboost-paysim@1.0.0 score_id=5d654b84-fd8b-4dc8-b11d-201316d2e11c",
      actor_user_id: null,
      created_at: "2026-10-05T01:08:47.826774Z"
    },
    {
      id: "4b001c74-4c45-4652-816e-3786948508a0",
      from_status: "OPEN",
      to_status: "IN_REVIEW",
      note: "Case moved to IN_REVIEW.",
      actor_user_id: "c8684733-a3ec-4cea-a174-00fc0070012f",
      created_at: "2026-10-05T01:08:52.321892Z"
    },
    {
      id: "b22c29e3-317b-47e7-a3e1-870fd14436b4",
      from_status: "IN_REVIEW",
      to_status: "CONFIRMED_FRAUD",
      note: "Case concluded as CONFIRMED_FRAUD.",
      actor_user_id: "c8684733-a3ec-4cea-a174-00fc0070012f",
      created_at: "2026-10-05T01:08:52.324367Z"
    }
  ],
  explanation: [],
  model_name: "xgboost-paysim",
  model_version: "1.0.0",
  model_decision: null,
  risk_engine_version: "2.0.0",
  signals: {
    rule_score: 100.0,
    model_score: 0.0009058773684955668,
    anomaly_score: 90.0,
    network_score: 0.0,
    weighted_score: 34.0005435264211,
    rule_floor_applied: true
  },
  triggered_rules: [
    {
      rule: "NIGHT_HIGH_VALUE",
      severity: "MEDIUM",
      description: "The TRANSFER of 46,784.48 occurred at hour 0, inside the configured night window."
    },
    {
      rule: "TAKAFUL_EARLY_CLAIM",
      source: "islamic",
      severity: "HIGH",
      description: "Takaful claim on contract TKF-0077 is made 9 days after the cover started."
    }
  ],
  network: {
    evidence: [],
    indicators: {
      sender_is_new: 1.0,
      component_size: 2.0,
      sender_fan_out: 1.0,
      receiver_fan_in: 1.0,
      receiver_is_new: 1.0,
      closes_short_cycle: 0.0,
      pass_through_ratio: 0.0,
      repeated_pair_count: 1.0,
      new_account_high_value: 0.0,
      sender_outgoing_volume: 46784.48
    },
    neighborhood: {
      edges: [
        {
          amount: 46784.48,
          source: "96c60563-fc1c-44e4-a50c-7433417704ce",
          target: "e6a903f6-f95a-4ab6-bd2b-6b3dcc73557a",
          timestamp: "2026-10-05T00:36:21.844494Z",
          transaction_id: "4d446a94-d9f7-4717-9c20-51cd7ac60266"
        }
      ],
      nodes: [
        {
          id: "96c60563-fc1c-44e4-a50c-7433417704ce",
          label: "Synthetic Islamic Bank"
        },
        {
          id: "e6a903f6-f95a-4ab6-bd2b-6b3dcc73557a",
          label: "Participant 0136"
        }
      ]
    },
    network_score: 0.0
  },
  anomaly: {
    threshold: 1.0,
    is_anomaly: false,
    anomaly_score: 0.9
  },
  decision_reasons: [
    {
      code: "NIGHT_HIGH_VALUE",
      source: "RULE",
      description: "The TRANSFER of 46,784.48 occurred at hour 0, inside the configured night window."
    },
    {
      code: "amount",
      source: "MODEL",
      description: "The transaction amount of 46,784.48 reduced the model's fraud risk."
    },
    {
      code: "oldbalanceOrg",
      source: "MODEL",
      description: "The origin account balance of 25,000,000.00 reduced the model's fraud risk."
    },
    {
      code: "oldbalanceDest",
      source: "MODEL",
      description: "The destination account balance of 22,174.00 reduced the model's fraud risk."
    },
    {
      code: "TAKAFUL_EARLY_CLAIM",
      source: "RULE",
      description: "Takaful claim on contract TKF-0077 is made 9 days after the cover started."
    }
  ],
  layer_findings: {
    islamic: {
      added: [
        {
          rule: "TAKAFUL_EARLY_CLAIM",
          source: "islamic",
          severity: "HIGH",
          description: "Takaful claim on contract TKF-0077 is made 9 days after the cover started."
        }
      ],
      facts: {
        event: "CLAIM",
        tenor: null,
        product: "TAKAFUL",
        contract_id: "TKF-0077",
        instalment_no: null
      },
      set_aside: [],
      score_after: 70.0,
      score_before: 30.0
    }
  },
  feedback: {
    id: "325c2081-6e78-4618-a85a-27260234b62e",
    case_id: "15c3d5f9-d7f1-4ca6-9488-349f001fd65f",
    anchor_alert_id: "bc60a52f-c6cd-477b-b7d8-e5174afcbfb5",
    score_id: "5d654b84-fd8b-4dc8-b11d-201316d2e11c",
    transaction_id: "4d446a94-d9f7-4717-9c20-51cd7ac60266",
    alert_count: 1,
    final_label: "CONFIRMED_FRAUD",
    confidence: "HIGH",
    model_agreement: "PARTIAL",
    fraud_typology: "TAKAFUL_CLAIM_FRAUD",
    decision_drivers: [
      "contract terms",
      "counterparty on the contract"
    ],
    missing_signals: [],
    notes: "Synthetic verdict planted by the Islamic book seed.",
    analyst_findings: null,
    reviewer_user_id: "c8684733-a3ec-4cea-a174-00fc0070012f",
    findings_by: null,
    assigned_to: null,
    case_opened_at: "2026-10-05T01:08:47.834012Z",
    decided_at: "2026-10-05T01:08:52.325796Z",
    model_version: "1.0.0",
    risk_engine_version: "2.0.0",
    original_risk_score: 70.0,
    original_model_score: 0.0009058773684955668,
    original_rule_score: 100.0,
    original_anomaly_score: 90.0,
    original_network_score: 0.0,
    original_triggered_rules: [
      {
        rule: "NIGHT_HIGH_VALUE",
        severity: "MEDIUM",
        description: "The TRANSFER of 46,784.48 occurred at hour 0, inside the configured night window."
      },
      {
        rule: "TAKAFUL_EARLY_CLAIM",
        source: "islamic",
        severity: "HIGH",
        description: "Takaful claim on contract TKF-0077 is made 9 days after the cover started."
      }
    ],
    original_layer_findings: {
      islamic: {
        added: [
          {
            rule: "TAKAFUL_EARLY_CLAIM",
            source: "islamic",
            severity: "HIGH",
            description: "Takaful claim on contract TKF-0077 is made 9 days after the cover started."
          }
        ],
        facts: {
          event: "CLAIM",
          tenor: null,
          product: "TAKAFUL",
          contract_id: "TKF-0077",
          instalment_no: null
        },
        set_aside: [],
        score_after: 70.0,
        score_before: 30.0
      }
    }
  }
};

/**
 * GET /v1/transactions/{id}/score for ISL-0153: a scheduled Murabaha early
 * settlement. ORIGIN_ACCOUNT_DRAIN set aside, 76 -> 66, so no alert.
 */
export const WIRE_SCORE_SETTLEMENT = {
  risk_level: "MEDIUM",
  model_name: "xgboost-paysim",
  model_version: "1.0.0",
  explanation: [
    {
      feature: "oldbalanceDest",
      contribution: -1.9682105779647827,
      direction: "LEGITIMATE",
      description: "The destination account balance of 25,000,000.00 reduced the model's fraud risk."
    },
    {
      feature: "dest_previous_transaction_count",
      contribution: -0.7231522798538208,
      direction: "LEGITIMATE",
      description: "The destination account had 1 previous transactions, which reduced the model's fraud risk."
    },
    {
      feature: "dest_previous_total_amount",
      contribution: -0.3626887798309326,
      direction: "LEGITIMATE",
      description: "The destination account's historical transaction volume was 7,129.93, which reduced the model's fraud risk."
    },
    {
      feature: "type_TRANSFER",
      contribution: -0.23786209523677826,
      direction: "LEGITIMATE",
      description: "The transaction type was TRANSFER, which reduced the model's fraud risk."
    },
    {
      feature: "amount",
      contribution: -0.2163907289505005,
      direction: "LEGITIMATE",
      description: "The transaction amount of 97,024.09 reduced the model's fraud risk."
    }
  ],
  model_decision: null,
  latency_ms: 26,
  scored_at: "2026-10-05T01:08:51.995663Z",
  risk_score: 66.1495726108551,
  risk_engine_version: "2.0.0",
  signals: {
    model_score: 71.91595435142517,
    rule_score: 60.0,
    anomaly_score: 80.0,
    network_score: 0.0,
    weighted_score: 66.1495726108551,
    rule_floor_applied: false
  },
  anomaly: {
    threshold: 1.0,
    is_anomaly: false,
    anomaly_score: 0.8
  },
  network: {
    evidence: [],
    indicators: {
      sender_is_new: 0.0,
      component_size: 3.0,
      sender_fan_out: 2.0,
      receiver_fan_in: 1.0,
      receiver_is_new: 0.0,
      closes_short_cycle: 0.0,
      pass_through_ratio: 0.0,
      repeated_pair_count: 2.0,
      new_account_high_value: 0.0,
      sender_outgoing_volume: 104828.56999999999
    },
    neighborhood: {
      edges: [
        {
          amount: 97024.09,
          source: "4d7828c6-a9c8-4a30-9ce5-29b876764052",
          target: "34d8bfaf-af33-4fd1-b3b5-3939cb1e8364",
          timestamp: "2026-10-05T01:06:21.844484Z",
          transaction_id: "b032f457-572a-4f71-98d4-ad91d85c1039"
        },
        {
          amount: 674.55,
          source: "4d7828c6-a9c8-4a30-9ce5-29b876764052",
          target: "c56054a9-4a69-4fa7-98e9-c0e4e1e56d0d",
          timestamp: "2026-10-05T00:22:18.806524Z",
          transaction_id: "836c6786-3f2a-4d06-afc3-f5f0bd596401"
        },
        {
          amount: 7129.93,
          source: "4d7828c6-a9c8-4a30-9ce5-29b876764052",
          target: "34d8bfaf-af33-4fd1-b3b5-3939cb1e8364",
          timestamp: "2026-10-05T00:25:43.869814Z",
          transaction_id: "c4eb1e6b-d696-4172-b356-eaa3b35d8af1"
        }
      ],
      nodes: [
        {
          id: "34d8bfaf-af33-4fd1-b3b5-3939cb1e8364"
        },
        {
          id: "4d7828c6-a9c8-4a30-9ce5-29b876764052"
        },
        {
          id: "c56054a9-4a69-4fa7-98e9-c0e4e1e56d0d"
        }
      ]
    },
    network_score: 0.0
  },
  triggered_rules: [
    {
      rule: "NIGHT_HIGH_VALUE",
      severity: "MEDIUM",
      description: "The TRANSFER of 97,024.09 occurred at hour 1, inside the configured night window.",
      source: null
    }
  ],
  decision_reasons: [
    {
      code: "NIGHT_HIGH_VALUE",
      source: "RULE",
      description: "The TRANSFER of 97,024.09 occurred at hour 1, inside the configured night window."
    }
  ],
  layer_findings: {
    islamic: {
      added: [],
      facts: {
        event: "EARLY_SETTLEMENT",
        tenor: 48,
        product: "MURABAHA",
        contract_id: "MUR-0021",
        instalment_no: 35
      },
      set_aside: [
        {
          rule: "ORIGIN_ACCOUNT_DRAIN",
          reason: "Scheduled early settlement of contract MUR-0021 empties the account by design.",
          severity: "HIGH",
          description: "The TRANSFER amount of 97,024.09 is within 1.0% of the origin balance of 97,742.07."
        }
      ],
      score_after: 66.1495726108551,
      score_before: 76.1495726108551
    }
  }
};

/** GET /v1/cases/{id} for the Takaful claim: member row facts and the frozen verdict. */
export const WIRE_CASE_ISLAMIC = {
  id: "15c3d5f9-d7f1-4ca6-9488-349f001fd65f",
  title: "Investigation ISL-0074",
  status: "CONFIRMED_FRAUD",
  severity: "HIGH",
  team: "team-alpha",
  assigned_to: null,
  opened_at: "2026-10-05T01:08:47.834012Z",
  closed_at: "2026-10-05T01:08:52.322542Z",
  alert_count: 1,
  findings: null,
  findings_by: null,
  findings_at: null,
  alerts: [
    {
      id: "bc60a52f-c6cd-477b-b7d8-e5174afcbfb5",
      transaction_id: "4d446a94-d9f7-4717-9c20-51cd7ac60266",
      score_id: "5d654b84-fd8b-4dc8-b11d-201316d2e11c",
      status: "CONFIRMED_FRAUD",
      severity: "HIGH",
      opened_at: "2026-10-05T01:08:47.825262Z",
      layer_facts: {
        islamic: {
          event: "CLAIM",
          tenor: null,
          product: "TAKAFUL",
          contract_id: "TKF-0077",
          instalment_no: null
        }
      }
    }
  ],
  feedback: {
    id: "325c2081-6e78-4618-a85a-27260234b62e",
    case_id: "15c3d5f9-d7f1-4ca6-9488-349f001fd65f",
    anchor_alert_id: "bc60a52f-c6cd-477b-b7d8-e5174afcbfb5",
    score_id: "5d654b84-fd8b-4dc8-b11d-201316d2e11c",
    transaction_id: "4d446a94-d9f7-4717-9c20-51cd7ac60266",
    alert_count: 1,
    final_label: "CONFIRMED_FRAUD",
    confidence: "HIGH",
    model_agreement: "PARTIAL",
    fraud_typology: "TAKAFUL_CLAIM_FRAUD",
    decision_drivers: [
      "contract terms",
      "counterparty on the contract"
    ],
    missing_signals: [],
    notes: "Synthetic verdict planted by the Islamic book seed.",
    analyst_findings: null,
    reviewer_user_id: "c8684733-a3ec-4cea-a174-00fc0070012f",
    findings_by: null,
    assigned_to: null,
    case_opened_at: "2026-10-05T01:08:47.834012Z",
    decided_at: "2026-10-05T01:08:52.325796Z",
    model_version: "1.0.0",
    risk_engine_version: "2.0.0",
    original_risk_score: 70.0,
    original_model_score: 0.0009058773684955668,
    original_rule_score: 100.0,
    original_anomaly_score: 90.0,
    original_network_score: 0.0,
    original_triggered_rules: [
      {
        rule: "NIGHT_HIGH_VALUE",
        severity: "MEDIUM",
        description: "The TRANSFER of 46,784.48 occurred at hour 0, inside the configured night window."
      },
      {
        rule: "TAKAFUL_EARLY_CLAIM",
        source: "islamic",
        severity: "HIGH",
        description: "Takaful claim on contract TKF-0077 is made 9 days after the cover started."
      }
    ],
    original_layer_findings: {
      islamic: {
        added: [
          {
            rule: "TAKAFUL_EARLY_CLAIM",
            source: "islamic",
            severity: "HIGH",
            description: "Takaful claim on contract TKF-0077 is made 9 days after the cover started."
          }
        ],
        facts: {
          event: "CLAIM",
          tenor: null,
          product: "TAKAFUL",
          contract_id: "TKF-0077",
          instalment_no: null
        },
        set_aside: [],
        score_after: 70.0,
        score_before: 30.0
      }
    }
  }
};
