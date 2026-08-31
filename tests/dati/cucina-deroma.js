// La cucina VERA dello chef, esportata dall'app il 30/08/2026: 15 persone,
// 6 partite, part-time con turni da 6 e 7 ore, tre persone su due partite con
// priorita', sei che non fanno turni extra.
//
// Serve perche' il banco di prova sintetico che usavamo prima era troppo
// facile — tutti uguali, una partita a testa, capienza abbondante — e passava
// mentre su questa il generatore sbagliava di brutto: 8,40 di sovracopertura,
// 9,25 di scopertura e zero spezzati su due partite, tutto nella stessa
// settimana. Un banco di prova che non somiglia al cliente non prova niente.
//
// I nomi sono quelli veri della brigata. Gli id delle stazioni sono stati
// riscritti in chiaro (pass, primi, ...) per rendere leggibili i fallimenti.

export const DEROMA = {
  "staff": [
    {
      "id": "chef",
      "name": "Chef",
      "stations": [],
      "weeklyQuota": [
        {
          "codes": [
            "R"
          ],
          "count": 2
        },
        {
          "codes": [
            "P"
          ],
          "count": 5
        }
      ],
      "hours": "40",
      "puoFareExtra": true
    },
    {
      "id": "chamo",
      "name": "Chamo",
      "stations": [],
      "weeklyQuota": [
        {
          "codes": [
            "R"
          ],
          "count": 2
        },
        {
          "codes": [
            "S",
            "P"
          ],
          "count": 5
        }
      ],
      "hours": "40",
      "puoFareExtra": true
    },
    {
      "id": "lorenc",
      "name": "Lorenc",
      "stations": [
        "pass",
        "primi"
      ],
      "weeklyQuota": [
        {
          "codes": [
            "R"
          ],
          "count": 2
        },
        {
          "codes": [
            "SP"
          ],
          "count": 3
        },
        {
          "codes": [
            "S",
            "P"
          ],
          "count": 2
        }
      ],
      "hours": "49",
      "puoFareExtra": true
    },
    {
      "id": "valerio",
      "name": "Valerio C.",
      "stations": [
        "primi"
      ],
      "weeklyQuota": [
        {
          "codes": [
            "R"
          ],
          "count": 2
        },
        {
          "codes": [
            "SP"
          ],
          "count": 3
        },
        {
          "codes": [
            "P",
            "S"
          ],
          "count": 2
        }
      ],
      "hours": "49",
      "puoFareExtra": true
    },
    {
      "id": "uddin",
      "name": "Uddin",
      "stations": [
        "secondi"
      ],
      "weeklyQuota": [
        {
          "codes": [
            "R"
          ],
          "count": 2
        },
        {
          "codes": [
            "SP"
          ],
          "count": 3
        },
        {
          "codes": [
            "P",
            "S"
          ],
          "count": 2
        }
      ],
      "hours": "49",
      "puoFareExtra": true
    },
    {
      "id": "mohammed",
      "name": "Mohammed",
      "stations": [
        "secondi",
        "pass"
      ],
      "weeklyQuota": [
        {
          "codes": [
            "R"
          ],
          "count": 2
        },
        {
          "codes": [
            "SP"
          ],
          "count": 3
        },
        {
          "codes": [
            "S",
            "P"
          ],
          "count": 2
        }
      ],
      "hours": "49",
      "puoFareExtra": true
    },
    {
      "id": "nisan",
      "name": "Nisan",
      "stations": [
        "antipasti",
        "pass"
      ],
      "weeklyQuota": [
        {
          "codes": [
            "R"
          ],
          "count": 2
        },
        {
          "codes": [
            "SP"
          ],
          "count": 3
        },
        {
          "codes": [
            "P",
            "S"
          ],
          "count": 2
        }
      ],
      "hours": "49",
      "puoFareExtra": true
    },
    {
      "id": "biplop",
      "name": "Biplop",
      "stations": [
        "antipasti"
      ],
      "weeklyQuota": [
        {
          "codes": [
            "R"
          ],
          "count": 2
        },
        {
          "codes": [
            "SP"
          ],
          "count": 3
        },
        {
          "codes": [
            "P",
            "S"
          ],
          "count": 2
        }
      ],
      "hours": "49",
      "puoFareExtra": true
    },
    {
      "id": "samad",
      "name": "Samad",
      "stations": [
        "insalate"
      ],
      "weeklyQuota": [
        {
          "codes": [
            "R"
          ],
          "count": 2
        },
        {
          "codes": [
            "R",
            "SP"
          ],
          "count": 3
        },
        {
          "codes": [
            "S",
            "P"
          ],
          "count": 2
        }
      ],
      "hours": "49",
      "puoFareExtra": true
    },
    {
      "id": "alessio",
      "name": "Alessio",
      "stations": [
        "pass"
      ],
      "weeklyQuota": [
        {
          "codes": [
            "R"
          ],
          "count": 3
        },
        {
          "codes": [
            "P1",
            "S1"
          ],
          "count": 4
        }
      ],
      "hours": "28",
      "puoFareExtra": false
    },
    {
      "id": "carlos",
      "name": "Carlos",
      "stations": [
        "pass"
      ],
      "weeklyQuota": [
        {
          "codes": [
            "R"
          ],
          "count": 3
        },
        {
          "codes": [
            "P2"
          ],
          "count": 4
        }
      ],
      "hours": "24",
      "puoFareExtra": false
    },
    {
      "id": "rakib",
      "name": "Rakib",
      "stations": [
        "insalate",
        "lavaggio"
      ],
      "weeklyQuota": [
        {
          "codes": [
            "R"
          ],
          "count": 2
        },
        {
          "codes": [
            "SP"
          ],
          "count": 3
        },
        {
          "codes": [
            "P",
            "S"
          ],
          "count": 2
        }
      ],
      "hours": "49",
      "puoFareExtra": false
    },
    {
      "id": "hossein",
      "name": "Hossein",
      "stations": [
        "lavaggio"
      ],
      "weeklyQuota": [
        {
          "codes": [
            "R"
          ],
          "count": 2
        },
        {
          "codes": [
            "SP"
          ],
          "count": 3
        },
        {
          "codes": [
            "P",
            "S"
          ],
          "count": 2
        }
      ],
      "hours": "49",
      "puoFareExtra": false
    },
    {
      "id": "akmol",
      "name": "Akmol",
      "stations": [
        "lavaggio"
      ],
      "weeklyQuota": [
        {
          "codes": [
            "R"
          ],
          "count": 2
        },
        {
          "codes": [
            "SP"
          ],
          "count": 3
        },
        {
          "codes": [
            "P",
            "S"
          ],
          "count": 2
        }
      ],
      "hours": "49",
      "puoFareExtra": false
    },
    {
      "id": "rabby",
      "name": "Rabby",
      "stations": [
        "lavaggio"
      ],
      "weeklyQuota": [
        {
          "codes": [
            "R"
          ],
          "count": 2
        },
        {
          "codes": [
            "R",
            "SP"
          ],
          "count": 3
        },
        {
          "codes": [
            "S",
            "P"
          ],
          "count": 2
        }
      ],
      "hours": "49",
      "puoFareExtra": false
    }
  ],
  "stations": [
    {
      "id": "pass",
      "name": "Pass"
    },
    {
      "id": "antipasti",
      "name": "Antipasti"
    },
    {
      "id": "primi",
      "name": "Primi"
    },
    {
      "id": "secondi",
      "name": "Secondi"
    },
    {
      "id": "insalate",
      "name": "Insalate"
    },
    {
      "id": "lavaggio",
      "name": "Lavaggio"
    }
  ],
  "staffingNeeds": {
    "cena": [
      {
        "count": 1,
        "stationId": "pass"
      },
      {
        "count": 1,
        "stationId": "antipasti"
      },
      {
        "count": 1,
        "stationId": "primi"
      },
      {
        "count": 1,
        "stationId": "secondi"
      },
      {
        "count": 1,
        "stationId": "insalate"
      },
      {
        "count": 2,
        "stationId": "lavaggio"
      }
    ],
    "pranzo": [
      {
        "count": 1,
        "stationId": "pass"
      },
      {
        "count": 1,
        "stationId": "antipasti"
      },
      {
        "count": 1,
        "stationId": "primi"
      },
      {
        "count": 1,
        "stationId": "secondi"
      },
      {
        "count": 1,
        "stationId": "insalate"
      },
      {
        "count": 2,
        "stationId": "lavaggio"
      }
    ]
  },
  "services": [
    {
      "id": "pranzo",
      "name": "Pranzo"
    },
    {
      "id": "cena",
      "name": "Cena"
    }
  ],
  "shiftTypes": [
    {
      "id": "1",
      "code": "P",
      "hours": 8,
      "label": "Pranzo",
      "services": [
        "pranzo"
      ]
    },
    {
      "id": "2",
      "code": "S",
      "hours": 8,
      "label": "Cena",
      "services": [
        "cena"
      ]
    },
    {
      "id": "3",
      "code": "SP",
      "hours": 11,
      "label": "Spezzato",
      "services": [
        "pranzo",
        "cena"
      ]
    },
    {
      "id": "4",
      "code": "P1",
      "hours": 7,
      "label": "Pranzo01",
      "services": [
        "pranzo"
      ]
    },
    {
      "id": "5",
      "code": "P2",
      "hours": 6,
      "label": "Pranzo02",
      "services": [
        "pranzo"
      ]
    },
    {
      "id": "6",
      "code": "S1",
      "hours": 7,
      "label": "Sera01",
      "services": [
        "cena"
      ]
    }
  ]
};
