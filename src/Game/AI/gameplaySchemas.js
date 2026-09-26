const textSchema = (description) => ({
  type: "string",
  description,
});

const nonEmptyTextSchema = (description) => ({
  ...textSchema(description),
  minLength: 1,
});

const stringArraySchema = (description) => ({
  type: "array",
  description,
  items: { type: "string" },
});

const actionSchema = {
  type: "object",
  description: "One concrete action the player can take.",
  properties: {
    id: textSchema("Optional stable action identifier."),
    title: textSchema("Short display title for the action."),
    text: textSchema("Concrete, executable description of the action."),
    kind: textSchema('Action kind: usually "action", or "chat" only for a diplomatic conversation.'),
    invitees: stringArraySchema("Exact polity names invited when this is a chat action."),
    chatStarter: textSchema("Opening diplomatic message when this is a chat action."),
    stance: textSchema("The philosophy this option embodies, in two or three words (e.g. 'curial tradition', 'managerial reform', 'austerity', 'expansion', 'concession', 'confrontation'). Within a topic that sets philosophies against each other, no two options share a stance."),
  },
  required: ["title", "text"],
  additionalProperties: false,
};

const chatCountrySchema = {
  type: "object",
  description: "A polity participating in a generated diplomatic chat.",
  properties: {
    code: textSchema("Polity's FULL country name (\"Spain\"), never a country code."),
    name: nonEmptyTextSchema("Exact polity name."),
  },
  required: ["name"],
  additionalProperties: false,
};

const chatMessageSchema = {
  type: "object",
  description: "An opening or follow-up message in a generated diplomatic chat.",
  properties: {
    code: textSchema("Speaker polity's FULL country name (\"Spain\"), never a country code."),
    role: textSchema("Message role, such as leader or system."),
    speaker: textSchema("Exact name of the speaker."),
    text: textSchema("Message body."),
    time: textSchema("In-game date or time, when relevant."),
  },
  required: ["text"],
  additionalProperties: false,
};

const createdChatSchema = {
  type: "object",
  description:
    "A diplomatic chat opened toward the player. The initiating polity ALWAYS "
    + "speaks first: title and openingMessage are required - a blank, untitled "
    + "chat tells the player nothing about why they were contacted.",
  properties: {
    id: textSchema("Optional stable chat identifier."),
    title: nonEmptyTextSchema("Short title naming the purpose of the chat (e.g. 'French mediation offer')."),
    countries: {
      type: "array",
      description: "Participating polities.",
      minItems: 1,
      items: chatCountrySchema,
    },
    messages: {
      type: "array",
      description: "Messages with which the chat begins.",
      items: chatMessageSchema,
    },
    openingMessage: nonEmptyTextSchema(
      "The initiating polity's first message, in its leader's voice - why it "
      + "reached out and what it wants. Never written as the player.",
    ),
    speaker: nonEmptyTextSchema("Name of the polity sending the opening message. Never the player's polity."),
    linkedEventId: textSchema("Optional event identifier linking this chat to its cause."),
    source: textSchema("Optional source label."),
    status: textSchema("Optional chat status."),
  },
  required: ["countries", "title", "speaker", "openingMessage"],
  additionalProperties: false,
};

const regionTransferSchema = {
  type: "object",
  description: "A transfer of one map region to a new polity owner.",
  properties: {
    regionId: textSchema(
      "Exact map region identifier when known; otherwise the region's plain name "
      + "(the engine resolves names to ids).",
    ),
    regionName: textSchema("Human-readable region name, when known."),
    fromCode: textSchema("Previous owner's FULL country name (\"Spain\"), never a country code."),
    toCode: textSchema("New owner's FULL country name (\"Spain\"), never a country code such as \"ESP\"."),
    note: textSchema("Brief reason for the transfer."),
    wholeCountry: {
      type: "boolean",
      description:
        "Set true ONLY for a total conquest, annexation, unification or partition in "
        + "which one polity takes EVERY region another still holds. Then put the losing "
        + "polity's name in regionId instead of a region name, and this single entry "
        + "transfers all of its territory. Leave unset (the normal case) to transfer "
        + "one named region.",
    },
  },
  required: ["regionId", "toCode"],
  additionalProperties: false,
};

// AI-authored updates to a country's PERSISTENT stat sheet (world.countryStats[code]).
// Only fields that CHANGED this period are sent; everything else persists. Absolute
// values, not deltas. Kept self-contained (no percentageSchema dep, which is defined
// later). LIVE via the tool schema, so it reaches existing frozen-prompt games.
const statPct = (description) => ({ type: "integer", minimum: 0, maximum: 100, description });
const statsUpdateSchema = {
  type: "object",
  description:
    "Updated national statistics for this polity. Include ONLY the fields that changed this period "
    + "(a coup changes leader/government/stability; a war changes reputation/economy) — every field you "
    + "omit keeps its previous value. Values are absolute, not deltas.",
  properties: {
    capital: textSchema("Capital, only when it changes."),
    continent: textSchema("Continent / broad region, only when it changes."),
    government: textSchema("Government system and ideology, only when it changes."),
    leader: textSchema("Head of state or government, only when it changes."),
    stability: statPct("National stability 0-100."),
    indices: {
      type: "object",
      properties: {
        sovereignty: statPct("Practical political sovereignty."),
        foodAutonomy: statPct("Domestic food autonomy."),
        energyAutonomy: statPct("Domestic energy autonomy."),
        economicIndependence: statPct("Economic independence."),
        internalSecurity: statPct("Internal security."),
        internationalReputation: statPct("International reputation / standing."),
      },
      additionalProperties: false,
    },
    economy: {
      type: "object",
      properties: {
        gdp: textSchema("GDP estimate."),
        gdpGrowth: textSchema("Annual GDP growth estimate."),
        gdpPerCapita: textSchema("GDP per capita estimate."),
        currency: textSchema("Currency."),
        inflation: textSchema("Inflation estimate."),
        unemployment: textSchema("Unemployment estimate."),
        publicDebt: textSchema("Public debt estimate."),
        budgetBalance: textSchema("Budget balance estimate."),
      },
      additionalProperties: false,
    },
    gdpBreakdown: {
      type: "object",
      description: "Agriculture/industry/services shares — send all three together so they still sum to ~100.",
      properties: {
        agriculture: statPct("Agriculture share of GDP."),
        industry: statPct("Industry share of GDP."),
        services: statPct("Services share of GDP."),
      },
      additionalProperties: false,
    },
    history: {
      type: "array",
      description:
        "One or more short, dated facts to ADD to this polity's own permanent record (a war it fought, "
        + "a coup, an invention, a famous leader's rise or fall) — never the full list, only NEW entries "
        + "this period. These append and survive independent of the global event log; use them for anything "
        + "specific to THIS polity you would need to remember and stay consistent with many turns from now.",
      items: { type: "string" },
    },
  },
  additionalProperties: false,
};

// The economic engine's levers (runtime/economyBridge.js). Capacities are
// 0-100 and move by points; policy is set outright; the monetary system is a
// partial replacement of its four answers. Output, prices and debt are never
// here — the engine computes them.
const capacityPoints = (description) => ({ type: "number", minimum: -50, maximum: 50, description });
const economyUpdateSchema = {
  type: "object",
  description: "Changes to this polity's economy through the engine's levers. Include ONLY what this period's events actually moved.",
  properties: {
    shift: {
      type: "object",
      description: "Points to ADD to a capacity (a reform is 3-10, a revolution 15-25, a collapse negative), or SY per year to add to a spending line.",
      properties: {
        technology: capacityPoints("Know-how."),
        administrativeReach: capacityPoints("How much of the country the state can assess and enforce in."),
        monetization: capacityPoints("How much of the economy runs on money."),
        marketIntegration: capacityPoints("Roads, ports, safe trade."),
        financialDepth: capacityPoints("Banks, bond markets, tradable paper."),
        fiscalCredibility: capacityPoints("Whether promises are believed."),
        legitimacy: capacityPoints("Whether the population accepts the state's demands."),
        openness: capacityPoints("Trade share of output."),
        militaryUpkeep: { type: "number", description: "SY per year added to (or, negative, removed from) forces in being." },
        civilSpending: { type: "number", description: "SY per year added to civil spending." },
        reserves: { type: "number", description: "SY of commodity reserves gained or lost." },
        populationShare: { type: "number", minimum: -0.2, maximum: 0.2, description: "Signed FRACTION of the population gained or lost this period — a plague, famine, war deaths, deportation, refugee inflow or annexed inhabitants (−0.08 = 8% dead or gone). Capped at ±20% per change; land and capital stay." },
        population: { type: "number", description: "Signed number of PEOPLE gained or (negative) lost, as an alternative to populationShare; the same ±20% cap applies." },
        transfers: { type: "number", description: "SY per year of donations/aid/subsidy gained or (negative) lost." },
        endowment: { type: "number", description: "SY of the state's productive patrimony gained (bequest, confiscation) or (negative) sold or lost." },
        unfundedLiabilities: { type: "number", description: "SY of unfunded promises (pensions, arrears) added or (negative) funded away by a reform." },
      },
      additionalProperties: false,
    },
    set: {
      type: "object",
      description: "Policy set outright.",
      properties: {
        taxRate: { type: "number", minimum: 0, maximum: 0.9, description: "Tax rate on the assessed base." },
        investmentShare: { type: "number", minimum: 0, maximum: 0.6, description: "Share of output invested." },
        militaryUpkeep: { type: "number", minimum: 0, description: "SY per year for forces in being." },
        civilSpending: { type: "number", minimum: 0, description: "SY per year of civil spending." },
        inflationTarget: { type: "number", minimum: -0.05, maximum: 0.5, description: "A central bank's target, if it has one." },
        atWar: { type: "boolean", description: "Whether total mobilisation is tolerated." },
        sanctionsFaced: { type: "number", minimum: 0, maximum: 1, description: "Share of this polity's trade access cut by others." },
        financing: { type: "string", enum: ["borrow", "print", "austerity", "drawdown"], description: "How deficits are covered; drawdown eats the patrimony before borrowing." },
        transfers: { type: "number", minimum: 0, description: "SY per year the state receives without taxing anyone (donations, aid, subsidy, tribute)." },
        endowmentYield: { type: "number", minimum: 0, maximum: 0.2, description: "Real annual return on the state's patrimony." },
        migrationPolicy: { type: "string", enum: ["open", "managed", "closed"], description: "Border policy (see [Migration]): open = a labour programme, free movement, a door held open; managed = selection, quotas, permits; closed = a wall, a visa freeze, or an exit ban on the polity's own people." },
      },
      additionalProperties: false,
    },
    monetarySystem: {
      type: "object",
      description: "What the money IS, as four answers; send only the ones that change. An invented system is described here.",
      properties: {
        label: textSchema("The money's name in this world."),
        backing: { type: "string", enum: ["none", "commodity", "futureClaims"], description: "What stands behind a unit." },
        issuer: { type: "string", enum: ["mint", "banks", "treasury", "market"], description: "Who creates it." },
        rule: { type: "string", enum: ["discretionary", "taylor", "fixed", "peg", "growthLinked"], description: "How much is created." },
        convertibility: { type: "number", minimum: 0, maximum: 1, description: "Whether a holder can redeem it for the backing." },
        fixedGrowth: { type: "number", description: "Rule fixed: money growth per year." },
        anchorInflation: { type: "number", description: "Rule peg: the anchor's inflation." },
        claimsHorizon: { type: "integer", minimum: 1, maximum: 100, description: "Backing futureClaims: years of revenue pledged." },
        claimsIssuanceShare: { type: "number", minimum: 0, maximum: 5, description: "Rule growthLinked: share of the tax base securitised per year." },
      },
      additionalProperties: false,
    },
    innovations: {
      type: "array",
      description: "Innovations adopted or advanced this period.",
      items: {
        type: "object",
        properties: {
          id: nonEmptyTextSchema("Stable id."),
          name: textSchema("Name."),
          adoption: { type: "number", minimum: 0, maximum: 1, description: "How far it has taken hold." },
          requires: { type: "object", description: "Capacity minimums (0-100) it needs, by capacity name.", additionalProperties: { type: "number" } },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

// Tokenised-infrastructure programme levers (runtime/projectFinance.js); the
// engine checks each op against the programme's rules.
const projectFinanceOpSchema = {
  type: "object",
  properties: {
    op: { type: "string", enum: ["create", "propose", "cancel", "setConversion", "setBuyback", "setGovernance"], description: "The lever." },
    program: {
      type: "object",
      description: "create: the programme.",
      properties: {
        name: textSchema("Programme name."), tokenLabel: textSchema("What a token is called."),
        currencyB: { type: "boolean", description: "A second, cost-of-living-indexed currency for daily life." }, currencyBLabel: textSchema("Its name."),
        governance: { type: "object", properties: { independentAudit: { type: "boolean" }, publicLedger: { type: "boolean" }, milestoneDisbursement: { type: "boolean" }, revaluationOnCashOnly: { type: "boolean" } }, additionalProperties: false },
        goldBuyback: { type: "object", properties: { enabled: { type: "boolean" }, thresholdShareOfOutput: { type: "number", minimum: 0.001, maximum: 0.5 } }, additionalProperties: false },
        conversion: { type: "object", properties: { officialRate: { type: "number", minimum: 0.01 }, managed: { type: "boolean" } }, additionalProperties: false },
      },
      additionalProperties: false,
    },
    project: {
      description: "propose: the project; cancel: its name or id.",
      anyOf: [
        { type: "string" },
        {
          type: "object",
          properties: {
            name: nonEmptyTextSchema("Project name."), kind: { type: "string", enum: ["productive", "social"], description: "Whether it earns cash." },
            sector: textSchema("port, road, rail, energy, mine, water, health, education..."),
            cost: { type: "number", minimum: 1, description: "Construction cost in SY." },
            expectedYield: { type: "number", minimum: 0, maximum: 1, description: "Annual cash / cost once built." },
            buildYears: { type: "number", minimum: 0.25, maximum: 30, description: "Years to build." },
            existing: { type: "boolean", description: "True if the asset or its revenue already exists (brownfield): the engine refuses it." },
            coupledTo: stringArraySchema("Productive project ids a social project rides on."),
          },
          required: ["name"],
          additionalProperties: false,
        },
      ],
    },
    officialRate: { type: "number", minimum: 0.01, description: "setConversion: B per A." },
    managed: { type: "boolean", description: "setConversion: whether the channel is managed." },
    enabled: { type: "boolean", description: "setBuyback." },
    thresholdShareOfOutput: { type: "number", minimum: 0.001, maximum: 0.5, description: "setBuyback." },
    independentAudit: { type: "boolean" }, publicLedger: { type: "boolean" }, milestoneDisbursement: { type: "boolean" }, revaluationOnCashOnly: { type: "boolean" },
  },
  required: ["op"],
  additionalProperties: false,
};

const polityChangeSchema = {
  type: "object",
  description: "A creation, rename, recolor, or metadata change for a polity.",
  properties: {
    code: textSchema("Polity's exact FULL country name (\"Spain\"), never a country code."),
    name: textSchema("New polity name, only when it changes."),
    color: textSchema("New six-digit hexadecimal color, only when it changes."),
    aliases: stringArraySchema("Alternative polity names."),
    // The prompt asks for this and gameState normalizes/clamps/writes it, but it
    // was missing here — and additionalProperties:false means a json_schema
    // provider could never emit it, so international reputation silently never
    // moved. Declaring it is what actually connects that feature.
    reputation: {
      type: "number",
      description:
        "International reputation 0-100, only when it changes. 0 is a pariah state, 100 is universally trusted.",
    },
    intelligence: {
      type: "number",
      description:
        "Intelligence service capability 0-100, only when it changes: a purge, a new bureau, a defector, "
        + "funding, a foreign penetration exposed. Decides how much of others' diplomacy this polity can "
        + "read, and how much of its own it can keep secret.",
    },
    tags: stringArraySchema(
      "The country's defining traits after this change — ideology, alignment, posture "
      + "(e.g. socialist, authoritarian, anti-nato). Only when they change: send the "
      + "COMPLETE new list, not a delta. A revolution or a change of alignment should "
      + "rewrite these.",
    ),
    note: textSchema("Brief reason for the change."),
    stats: statsUpdateSchema,
    economy: economyUpdateSchema,
    projectFinance: { type: "array", description: "Levers of this polity's tokenised-infrastructure programme (see [Tokenised Infrastructure Programmes]).", items: projectFinanceOpSchema },
  },
  required: ["code"],
  additionalProperties: false,
};

const unitSchema = {
  type: "object",
  description: "A military unit to create on the map.",
  properties: {
    id: textSchema("Stable unit identifier."),
    name: nonEmptyTextSchema("Display name for the unit."),
    type: {
      type: "string",
      description: "Unit type.",
      enum: ["infantry", "armor", "air", "naval", "artillery", "garrison"],
    },
    ownerCode: nonEmptyTextSchema("Owning polity's FULL country name (\"Spain\"), never a country code."),
    strength: {
      type: "integer",
      description: "Unit strength from 1 to 1000.",
      minimum: 1,
      maximum: 1000,
    },
    lng: {
      type: "number",
      description: "Longitude of the unit location.",
      minimum: -180,
      maximum: 180,
    },
    lat: {
      type: "number",
      description: "Latitude of the unit location.",
      minimum: -90,
      maximum: 90,
    },
    regionId: textSchema("Map region identifier, when known."),
    status: {
      type: "string",
      description: "Optional unit status.",
      enum: ["idle", "moving", "engaged", "pending"],
    },
    note: textSchema("Brief operational note."),
  },
  required: ["name", "type", "ownerCode", "strength", "lng", "lat"],
  additionalProperties: false,
};

const unitOpSchema = {
  description: "A unit mutation. Use op spawn, move, strength, or remove and fill the fields that op needs.",
  anyOf: [
    {
      type: "object",
      properties: {
        op: { type: "string", enum: ["spawn"] },
        unit: unitSchema,
      },
      required: ["op", "unit"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        op: { type: "string", enum: ["move"] },
        unitId: nonEmptyTextSchema("Existing unit identifier."),
        toLng: { type: "number", minimum: -180, maximum: 180 },
        toLat: { type: "number", minimum: -90, maximum: 90 },
        regionId: textSchema("Destination region identifier, when known."),
        note: textSchema("Brief explanation of the operation."),
      },
      required: ["op", "unitId", "toLng", "toLat"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        op: { type: "string", enum: ["strength"] },
        unitId: nonEmptyTextSchema("Existing unit identifier."),
        strength: { type: "integer", minimum: 0, maximum: 1000 },
        note: textSchema("Brief explanation of the operation."),
      },
      required: ["op", "unitId", "strength"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        op: { type: "string", enum: ["remove"] },
        unitId: nonEmptyTextSchema("Existing unit identifier."),
        note: textSchema("Brief explanation of the operation."),
      },
      required: ["op", "unitId"],
      additionalProperties: false,
    },
  ],
};

const markerSchema = {
  type: "object",
  description:
    "A named structure on the map. kind is free-form lowercase - city, military base, "
    + "bunker, missile silo, embassy, port, airfield, factory, monument, or anything else.",
  properties: {
    id: textSchema("Stable marker identifier."),
    name: nonEmptyTextSchema("Display name of the structure."),
    kind: nonEmptyTextSchema("What the structure is, as a short lowercase noun phrase."),
    ownerCode: textSchema("Owning polity's FULL country name (\"Spain\") when owned, never a country code."),
    lng: {
      type: "number",
      description: "Longitude of the structure.",
      minimum: -180,
      maximum: 180,
    },
    lat: {
      type: "number",
      description: "Latitude of the structure.",
      minimum: -90,
      maximum: 90,
    },
    note: textSchema("Brief description shown when the structure is inspected."),
    foundedAt: textSchema("In-game date the structure was built or founded."),
  },
  required: ["name", "kind", "lng", "lat"],
  additionalProperties: false,
};

const markerOpSchema = {
  description: "A structure/place mutation. Use op build, remove, or rename and fill the fields that op needs.",
  anyOf: [
    {
      type: "object",
      properties: {
        op: { type: "string", enum: ["build"] },
        marker: markerSchema,
      },
      required: ["op", "marker"],
      additionalProperties: false,
    },
    // The same build, written flat. Models routinely put the structure's fields
    // beside `op` instead of nesting them under `marker`, and the engine has always
    // read that shape (normalizeMarkerOp falls back to the entry itself). Only this
    // schema refused it — and because a rejected op fails the WHOLE payload, one
    // flattened building threw away the entire turn and left the player with
    // fallback events. Accept what we already understand.
    {
      type: "object",
      properties: {
        op: { type: "string", enum: ["build"] },
        id: textSchema("Stable marker identifier."),
        name: nonEmptyTextSchema("Name of the structure or place."),
        kind: textSchema("What it is: city, base, bunker, silo, embassy, port."),
        ownerCode: textSchema("Owning polity's FULL country name (\"Spain\"), never a country code."),
        lng: { type: "number", description: "Longitude.", minimum: -180, maximum: 180 },
        lat: { type: "number", description: "Latitude.", minimum: -90, maximum: 90 },
        note: textSchema("Brief explanation."),
      },
      required: ["op", "name", "lng", "lat"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        op: { type: "string", enum: ["remove"] },
        markerId: textSchema("Existing marker identifier, when known."),
        name: nonEmptyTextSchema("Name of the structure to remove."),
        note: textSchema("Brief explanation of the removal."),
      },
      required: ["op", "name"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        op: { type: "string", enum: ["rename"] },
        markerId: textSchema("Existing marker identifier, when known."),
        name: nonEmptyTextSchema("Current name of the structure or city to rename."),
        newName: nonEmptyTextSchema("New display name."),
        note: textSchema("Brief explanation of the rename."),
      },
      required: ["op", "name", "newName"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        op: { type: "string", enum: ["population"] },
        markerId: textSchema("Existing marker identifier, when known."),
        name: nonEmptyTextSchema("Name of the city whose population changed."),
        population: {
          type: "integer",
          description: "The city's new total population, as a whole number of people.",
          minimum: 0,
        },
        note: textSchema("Why it changed: siege, famine, industrial boom, refugees."),
      },
      required: ["op", "name", "population"],
      additionalProperties: false,
    },
  ],
};

// International bodies (runtime/organizations.js): founded, joined, left, voted in.
const organizationOpSchema = {
  type: "object",
  properties: {
    op: { type: "string", enum: ["create", "dissolve", "join", "leave", "expel", "update", "resolve"], description: "What happens to the body." },
    organization: {
      description: "For create: the body {name, kind, founded, seat, charter, members, leader, votingRule}. For every other op: the body's exact name.",
      anyOf: [
        { type: "string" },
        {
          type: "object",
          properties: {
            name: nonEmptyTextSchema("Name."),
            kind: { type: "string", enum: ["alliance", "security", "trade", "monetary", "political", "religious", "league", "other"], description: "What kind of body." },
            founded: textSchema("YYYY-MM-DD."), seat: textSchema("Where it sits."), charter: textSchema("One line on its purpose."),
            members: stringArraySchema("Founding members, full polity names."), leader: textSchema("Leading polity, if any."),
            votingRule: { type: "string", enum: ["unanimity", "majority", "weighted", "hegemon"], description: "How it decides." },
          },
          required: ["name"],
          additionalProperties: false,
        },
      ],
    },
    member: textSchema("join/leave/expel: the polity concerned."),
    date: textSchema("YYYY-MM-DD, for dissolve."),
    changes: {
      type: "object",
      description: "update: fields that change.",
      properties: { name: textSchema("New name."), kind: textSchema("New kind."), seat: textSchema("New seat."), charter: textSchema("New charter."), leader: textSchema("New leader."), votingRule: textSchema("New rule.") },
      additionalProperties: false,
    },
    resolution: {
      type: "object",
      description: "resolve: the resolution voted.",
      properties: {
        title: nonEmptyTextSchema("Title."), text: textSchema("What it decides."), proposedBy: textSchema("Proposing polity."),
        votesFor: stringArraySchema("Members voting for."), votesAgainst: stringArraySchema("Members voting against."), abstained: stringArraySchema("Members abstaining."),
        passed: { type: "boolean", description: "Whether it passed under the body's rule." }, date: textSchema("YYYY-MM-DD."),
        sanctions: { type: "object", properties: { target: nonEmptyTextSchema("Sanctioned polity."), intensity: { type: "number", minimum: 0, maximum: 1, description: "Share of its trade access cut; 0 lifts sanctions." } }, required: ["target", "intensity"], additionalProperties: false },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  required: ["op", "organization"],
  additionalProperties: false,
};

// Standing multi-turn schemes (runtime/intents.js): a polity or an
// organization's own plan, tracked with a real stage instead of a tag string.
const intentRefSchema = {
  description: "Which intent: its id, or {owner, kind} to match the owner's current active intent of that kind.",
  anyOf: [
    { type: "string" },
    {
      type: "object",
      properties: { owner: nonEmptyTextSchema("Exact polity or organization name."), kind: textSchema("Its kind, to disambiguate.") },
      required: ["owner"],
      additionalProperties: false,
    },
  ],
};
const intentOpSchema = {
  type: "object",
  properties: {
    op: { type: "string", enum: ["create", "advance", "resolve", "abandon", "expose"], description: "What happens to the scheme." },
    intent: {
      description: "For create: the scheme itself. For every other op: which one (see intentRef).",
      anyOf: [
        intentRefSchema,
        {
          type: "object",
          properties: {
            ownerType: { type: "string", enum: ["polity", "organization"], description: "Who holds this scheme." },
            owner: nonEmptyTextSchema("Exact polity or organization name."),
            target: textSchema("Polity or organization it is aimed at, or empty for none."),
            kind: { type: "string", enum: ["economic", "diplomatic", "military", "espionage", "political", "other"] },
            summary: nonEmptyTextSchema("The actual plan, one sentence."),
            secret: { type: "boolean", description: "Hidden from the player and the target until exposed." },
            stance: { type: "string", enum: ["hostile", "neutral", "supportive"], description: "What this scheme means for its target: hostile works against it, neutral pursues its own line beside it, supportive works for it. Never make every power hostile to the same target." },
            scope: { type: "array", items: { type: "string" }, description: "A few lower-case keywords naming what this scheme is about (\"liturgy\", \"audit\", \"curia\", \"tariffs\"). A hostile scheme only bites on orders that touch its scope; leave empty only for a power that truly opposes everything its target does." },
            triggerHint: textSchema("What makes it advance or pay off."),
          },
          required: ["owner", "summary"],
          additionalProperties: false,
        },
      ],
    },
    stage: { type: "number", minimum: 0, maximum: 100, description: "advance: absolute new stage." },
    stageDelta: { type: "number", description: "advance: change in stage, when not setting it absolutely." },
    note: textSchema("advance: what changed, for the intent's own short log."),
    outcome: textSchema("resolve: what happened."),
    success: { type: "boolean", description: "resolve: whether the scheme actually paid off." },
    loan: {
      type: "object",
      description: "resolve only, and only when success is true: a sovereign loan actually granted. Moves real SY between the two economies — never narrate a loan as granted without this.",
      properties: {
        amount: { type: "number", minimum: 0, description: "SY disbursed." },
        lender: nonEmptyTextSchema("Exact name of the polity paying out."),
        borrower: nonEmptyTextSchema("Exact name of the polity receiving it."),
      },
      required: ["amount", "lender", "borrower"],
      additionalProperties: false,
    },
    sabotage: {
      type: "object",
      description: "resolve only, and only when success is true: real damage a hostile scheme actually inflicts. Never narrate sabotage, funded unrest, or a cyberattack as succeeding without this.",
      properties: {
        target: nonEmptyTextSchema("Exact name of the polity harmed."),
        kind: { type: "string", enum: ["infrastructure", "legitimacy", "credit"], description: "infrastructure: capital destroyed. legitimacy: public trust eroded. credit: fiscal credibility eroded." },
        intensity: { type: "number", minimum: 0, maximum: 1, description: "How severe — 1.0 is a major, campaign-defining strike." },
      },
      required: ["target", "kind", "intensity"],
      additionalProperties: false,
    },
    reason: textSchema("abandon: why it was dropped."),
  },
  required: ["op", "intent"],
  additionalProperties: false,
};

const impactsSchema = {
  type: "object",
  description: "Optional structured world-state effects. Include only effect arrays that are relevant.",
  properties: {
    actionIds: stringArraySchema("Player action identifiers resolved by the event."),
    createdChats: {
      type: "array",
      description: "Diplomatic chats opened by the event.",
      items: createdChatSchema,
    },
    polityChanges: {
      type: "array",
      description: "Polity metadata changes.",
      items: polityChangeSchema,
    },
    regionTransfers: {
      type: "array",
      description:
        "Map ownership changes. REQUIRED whenever the event text says territory was "
        + "captured, occupied, annexed, ceded, liberated, or otherwise changed hands - "
        + "one entry per affected region, or the map will not match the story.",
      items: regionTransferSchema,
    },
    unitOps: {
      type: "array",
      description: "Military unit operations.",
      items: unitOpSchema,
    },
    organizationOps: {
      type: "array",
      description: "International bodies founded, dissolved, joined, left, or voting on a resolution (see [International Organizations]).",
      items: organizationOpSchema,
    },
    intentOps: {
      type: "array",
      description: "A polity's or organization's own standing multi-turn scheme created, advanced, resolved, abandoned or exposed (see [Standing Intents]).",
      items: intentOpSchema,
    },
    canonFacts: {
      type: "array",
      description:
        "One-line, dated, atomic facts this event establishes that the campaign must never contradict later — a regime change, a war's outcome, a treaty signed, a divergence from real history. These are NEVER summarized or reworded later, so keep each one short, self-contained, and precise. Only for genuinely durable facts, not routine narration.",
      items: { type: "string" },
    },
    actionOutcomes: {
      type: "array",
      description: "The fate of each of the player's planned orders this event resolves (see [Reality Check]): success, partial, or failure, with the named constraint or cost as the reason. An outcome better than the computed verdict is downgraded by the engine.",
      items: {
        type: "object",
        properties: {
          actionId: { type: "string", description: "The planned order's id, exactly as listed." },
          outcome: { type: "string", enum: ["success", "partial", "failure"] },
          reason: textSchema("The constraint that decided it, or the real cost of a success — one line."),
        },
        required: ["actionId", "outcome"],
        additionalProperties: false,
      },
    },
    faithfulOps: {
      type: "array",
      description: "Reforming-pope mode only: real people joining or leaving the Church on a continent because of THIS event — a schism, a mass conversion, an exodus after a scandal (see [Fidèles — registre vivant]). Give delta in people (signed) or share as a signed fraction of that continent; never more than a fifth of a continent at once.",
      items: {
        type: "object",
        properties: {
          op: { type: "string", enum: ["shift"] },
          continent: { type: "string", enum: ["africa", "americas", "asia", "europe", "oceania"] },
          delta: { type: "number", description: "People, signed." },
          share: { type: "number", minimum: -0.2, maximum: 0.2, description: "Signed fraction of the continent's faithful, instead of delta." },
          note: textSchema("Why."),
        },
        required: ["op", "continent"],
        additionalProperties: false,
      },
    },
    driveOps: {
      type: "array",
      description: "Money a fundraising drive actually moved in THIS event (see [Fundraising Drives]): pledge (a promise, in millions of the drive's currency), collect (what reached the treasury; never more than was pledged), withdraw (a pledge that fell through), close, or create (a new drive with a target). An event that says a drive went well without one of these raised nothing.",
      items: {
        type: "object",
        properties: {
          op: { type: "string", enum: ["pledge", "collect", "withdraw", "close", "create"] },
          drive: textSchema("The drive's exact name as listed (pledge/collect/withdraw/close)."),
          name: textSchema("create: the new drive's name."),
          owner: textSchema("create: exact name of the polity running it."),
          target: { type: "number", minimum: 0, description: "create: the target, in millions of the currency." },
          currency: textSchema("create: EUR, USD, GBP…"),
          amount: { type: "number", minimum: 0, description: "Millions of the drive's currency moved by this op." },
          source: textSchema("Who gave or promised it — a named donor, a diaspora, a bank syndicate."),
          note: textSchema("Why, in one line."),
        },
        required: ["op"],
        additionalProperties: false,
      },
    },
    treasuryOps: {
      type: "array",
      description: "A body's OWN money (see [Bodies With a Purse]): open a purse for a body the world already holds, capitalise it from somewhere real, set the margin its operations have actually shown, or set how it splits what it hands to its members. The distribution itself is the engine's, never narrated — set the key and report what the step did.",
      items: {
        type: "object",
        properties: {
          op: { type: "string", enum: ["open", "capitalise", "margin", "key", "windUp"] },
          body: nonEmptyTextSchema("Exact name of the organization, which must already exist."),
          parent: textSchema("open: the body it sits within, for a federation of bodies."),
          amount: { type: "number", minimum: 0, description: "capitalise: SY put into its capital." },
          from: textSchema("capitalise: who put it in — a state, a member, a drive."),
          margin: { type: "number", minimum: 0, maximum: 0.25, description: "margin: net annual return its operations actually earn on capital." },
          retain: { type: "number", minimum: 0, maximum: 1, description: "key: the share it keeps of what it earns, for working capital and investment only." },
          beneficiary: textSchema("key: the body or polity this one exists to finance, paid first out of what is handed on."),
          beneficiaryShare: { type: "number", minimum: 0, maximum: 1, description: "key: the share of what is handed on that goes to the beneficiary before the rest is split." },
          key: { type: "string", enum: ["equal", "need", "contribution"], description: "How the rest is split: equally, more to the poorer member, or in proportion to what each put in." },
          note: textSchema("Why, in one line."),
        },
        required: ["op", "body"],
        additionalProperties: false,
      },
    },
    gatheringOps: {
      type: "array",
      description: "A gathering people travel to (see [Gatherings]): plan one, hold one, or cancel it. The engine decides how many came and what it took — never write an attendance figure.",
      items: {
        type: "object",
        properties: {
          op: { type: "string", enum: ["plan", "hold", "cancel"] },
          name: textSchema("plan: what it is called."),
          gathering: textSchema("hold/cancel: the gathering's exact name."),
          host: textSchema("plan: the body or polity running it, which must already have a purse."),
          place: textSchema("plan: where it is held."),
          continent: { type: "string", enum: ["africa", "americas", "asia", "europe", "oceania"], description: "plan: whose people it draws on, for a body that gathers the faithful." },
          date: textSchema("plan: when it is held."),
          cost: { type: "number", minimum: 0, description: "plan: what staging it costs, in SY." },
          expected: { type: "number", minimum: 0, description: "plan: how many the host hopes for. The engine caps it." },
          spendPerHead: { type: "number", minimum: 0, maximum: 0.5, description: "plan: what one attendee spends with the host, in SY." },
          patronage: { type: "number", minimum: 0, description: "plan/hold: sponsorship actually pledged, in SY." },
          costOverrun: { type: "number", minimum: 0, description: "hold: what it cost beyond the budget." },
          reason: textSchema("cancel: why."),
          note: textSchema("One line."),
        },
        required: ["op"],
        additionalProperties: false,
      },
    },
    migrationOps: {
      type: "array",
      description: "People this event moved from one polity to another that wages and war would NOT have moved on their own — an expulsion, a population exchange, a guest-worker treaty, a boat crisis, a diaspora returning after a peace (see [Migration — engine state]). The ordinary wage-and-war flows are computed by the engine every jump and must NOT be repeated here. Both polities must exist in this world; no single op moves more than 15% of the sender's people.",
      items: {
        type: "object",
        properties: {
          op: { type: "string", enum: ["flow"] },
          from: textSchema("The polity people leave, full name."),
          to: textSchema("The polity they reach, full name."),
          people: { type: "number", minimum: 0, description: "Number of people moved." },
          share: { type: "number", minimum: 0, maximum: 0.15, description: "Fraction of the SENDER's population moved, instead of people." },
          cause: { type: "string", enum: ["war", "famine", "work", "persecution", "policy", "climate"], description: "What actually moved them." },
          note: textSchema("Why, in one line."),
        },
        required: ["op", "from", "to"],
        additionalProperties: false,
      },
    },
    warOps: {
      type: "array",
      description: "Wars declared, joined, paused, ended or escalated (see [Wars — engine state]). No battle, casualty or conquest can happen between polities not on opposite sides of an active war; declare it here first. Peace ends a war with an outcome.",
      items: {
        type: "object",
        properties: {
          op: { type: "string", enum: ["declare", "join", "ceasefire", "end", "intensity"] },
          attacker: textSchema("declare: the polity declaring war (full name)."),
          defender: textSchema("declare: the polity declared against (full name)."),
          casus: textSchema("declare: why."),
          allies: stringArraySchema("declare: co-belligerents joining the attacker's side."),
          war: textSchema("join/ceasefire/end/intensity: the war's id exactly as listed in [Wars], or \"<attacker> vs <defender>\"."),
          polity: textSchema("join: the polity entering the war."),
          side: { type: "string", enum: ["a", "b"], description: "join: side a (the declaring side) or b." },
          outcome: { type: "string", enum: ["a", "b", "stalemate"], description: "end: who prevailed." },
          terms: textSchema("end: what the peace settles."),
          delta: { type: "number", minimum: -1, maximum: 1, description: "intensity: signed change on a 0-1 scale." },
        },
        required: ["op"],
        additionalProperties: false,
      },
    },
    leaderOps: {
      type: "array",
      description: "A polity's leader installed (election, succession, conclave, re-election = same name), removed (coup, resignation, death you narrate), or the real date of its next election/conclave scheduled (see [Leaders — engine state]). Every DUE item listed there must be resolved here.",
      items: {
        type: "object",
        properties: {
          op: { type: "string", enum: ["install", "remove", "schedule"] },
          polity: textSchema("The polity, full name."),
          name: textSchema("install: the new (or confirmed) leader's name."),
          mode: { type: "string", enum: ["election", "hereditary", "life", "appointment", "conclave"], description: "install: tenure mode; omitted keeps the seat's current mode." },
          termYears: { type: "number", minimum: 0, maximum: 99, description: "install: length of the term in years; 0 = for life." },
          born: { type: "number", description: "install: birth year, so the engine can roll mortality." },
          reason: textSchema("remove: why (coup, resignation, impeachment, assassination)."),
          nextDue: textSchema("schedule: the real next election/conclave date, YYYY-MM-DD."),
          kind: { type: "string", enum: ["election", "conclave", "term-end"], description: "schedule: what falls due on nextDue." },
        },
        required: ["op", "polity"],
        additionalProperties: false,
      },
    },
    markerOps: {
      type: "array",
      description:
        "Structures built, destroyed, renamed or resized on the map. Use whenever "
        + "the event founds, constructs, or destroys a named place - a city, military "
        + "base, bunker, missile silo, embassy, port - so the map shows it, and "
        + "whenever a city's POPULATION changes.",
      items: markerOpSchema,
    },
  },
  additionalProperties: false,
};

const eventSchema = {
  type: "object",
  description: "One dated campaign event produced by a timeline simulation.",
  properties: {
    id: textSchema("Optional stable event identifier."),
    date: textSchema("In-game date on which the event occurs."),
    title: textSchema("Concise event headline."),
    description: textSchema("Specific narrative description and consequences."),
    importance: textSchema("Importance label, normally minor or major."),
    kind: textSchema("Event category, such as world, player, diplomacy, or military."),
    notable: {
      type: "boolean",
      description: "Whether this event is important enough to stop an automatic jump.",
    },
    playerRelated: {
      type: "boolean",
      description: "Whether the event directly concerns the player polity.",
    },
    actor: textSchema(
      "The power acting, when this event's impacts move the map: a polity, a faction or a body, named as the world holds it. It faces the same check a player order faces and loses its map changes when that blocks it. Empty for ambience, which then carries no region transfer and no unit op.",
    ),
    impacts: impactsSchema,
  },
  required: ["date", "title", "description"],
  additionalProperties: false,
};

const catalystSchema = {
  type: "object",
  description: "An interactive catalyst scene offered to the player.",
  properties: {
    title: textSchema("Short catalyst title."),
    premise: textSchema("Stable premise and stakes of the scene."),
    opening: textSchema("Immersive opening state requiring player input."),
    choices: {
      type: "array",
      description: "Two to five distinct choices available to the player.",
      minItems: 2,
      maxItems: 5,
      items: nonEmptyTextSchema("One player choice."),
    },
  },
  required: ["title", "premise", "opening", "choices"],
  additionalProperties: false,
};

const nullableCatalystSchema = {
  anyOf: [catalystSchema, { type: "null" }],
};

export const ACTIONS_SCHEMA = {
  type: "object",
  description: "Strategic topics of concern and concrete actions available under each topic.",
  properties: {
    topics: {
      type: "array",
      description: "Current strategic topics of concern.",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          id: textSchema("Optional stable topic identifier."),
          title: textSchema("Short title naming the concern."),
          description: textSchema("Why the concern matters now."),
          dilemma: textSchema("When the options embody different philosophies: one sentence on what they disagree about and what choosing one costs. Empty for a topic whose options are merely complementary."),
          actions: {
            type: "array",
            description: "Concrete actions addressing this concern.",
            minItems: 1,
            items: actionSchema,
          },
        },
        required: ["title", "description", "actions"],
        additionalProperties: false,
      },
    },
  },
  required: ["topics"],
  additionalProperties: false,
};

export const JUMP_FORWARD_SCHEMA = {
  type: "object",
  description: "A simulated timeline jump containing dated events and the resulting campaign state.",
  properties: {
    events: {
      type: "array",
      description: "Events occurring during the simulated period.",
      items: eventSchema,
    },
    stopDate: textSchema("Date at which the simulation stops."),
    summary: textSchema("Concise summary of the period and its strategic consequences."),
    clearActions: {
      type: "boolean",
      description: "Whether planned player actions were resolved by this jump.",
    },
    catalyst: nullableCatalystSchema,
    diplomaticOutreach: {
      type: "array",
      description:
        "Polities reaching out to the player ON THEIR OWN initiative - treaty "
        + "feelers, trade proposals, warnings, summit invitations - not tied to "
        + "any single event. One-on-one or group. Empty when nobody would "
        + "plausibly reach out this period.",
      items: createdChatSchema,
    },
  },
  required: ["events", "stopDate", "summary", "clearActions"],
  additionalProperties: false,
};

export const AUTO_JUMP_FORWARD_SCHEMA = JUMP_FORWARD_SCHEMA;

// Backstory events deliberately have NO impacts field: the scenario's world
// state already reflects everything that happened before round one, so a
// pre-game event is a record, never a change to apply.
const pregameEventSchema = {
  type: "object",
  description: "One dated historical event from BEFORE the game's start date.",
  properties: {
    date: textSchema("Date the event occurred, strictly before the game start date."),
    title: textSchema("Concise event headline."),
    description: textSchema("Specific narrative description and its consequences."),
    importance: textSchema("Importance label, normally minor or major."),
    kind: textSchema("Event category, such as world, player, diplomacy, or military."),
  },
  required: ["date", "title", "description"],
  additionalProperties: false,
};

export const PREGAME_HISTORY_SCHEMA = {
  type: "object",
  description: "The pre-game backstory: the events that led up to the start of the campaign.",
  properties: {
    events: {
      type: "array",
      description: "Chronological events from before round one, oldest first.",
      minItems: 1,
      maxItems: 12,
      items: pregameEventSchema,
    },
    summary: textSchema("One-paragraph summary of the era leading into the start date."),
  },
  required: ["events", "summary"],
  additionalProperties: false,
};

// The idle-time diplomatic drip: while the player sits between jumps, a polity
// may send a short note to their inbox. `chat: null` means nobody plausibly
// would right now - silence is the common, correct answer.
export const IDLE_DIPLOMACY_SCHEMA = {
  type: "object",
  description: "At most one short unprompted diplomatic note to the player, or null for silence.",
  properties: {
    chat: {
      anyOf: [
        { type: "null", description: "No polity would plausibly reach out right now." },
        createdChatSchema,
      ],
    },
  },
  required: ["chat"],
  additionalProperties: false,
};

export const DESCRIPTION_TO_ACTION_SCHEMA = {
  type: "object",
  description: "One structured game command converted from the player's freeform intent.",
  properties: {
    title: textSchema("Short display title for the command."),
    text: textSchema("Expanded command with enough detail for timeline simulation."),
    kind: textSchema('Command kind: "action" unless the player explicitly asked to open a diplomatic chat.'),
    invitees: stringArraySchema("Exact polity names invited to a chat; empty for a normal action."),
    chatStarter: textSchema("Opening message for a chat; empty for a normal action."),
  },
  required: ["title", "text", "kind"],
  additionalProperties: false,
};

export const NEXT_SPEAKER_SCHEMA = {
  type: "object",
  description: "The exact participant who should speak next in the diplomatic chat.",
  properties: {
    nextSpeaker: textSchema("Exact name of one chat participant other than the most recent speaker."),
  },
  required: ["nextSpeaker"],
  additionalProperties: false,
};

export const EVENT_CONSOLIDATOR_SCHEMA = {
  type: "object",
  description: "A continuity-safe summary of the supplied events and diplomatic chats.",
  properties: {
    summary: textSchema("Concise campaign history preserving major events, map changes, and diplomatic commitments."),
    keyFacts: {
      type: "array",
      description:
        "One-line, dated, atomic facts worth preserving PRECISELY, never reworded again — a regime change, a war's outcome, a treaty, a territorial change, a divergence from real history. A safety net alongside the prose summary: anything genuinely durable that a future turn must not contradict, even if it was never flagged as a canon fact when the original event happened.",
      items: { type: "string" },
    },
  },
  required: ["summary"],
  additionalProperties: false,
};

export const CATALYST_CREATION_SCHEMA = catalystSchema;

export const CATALYST_EXECUTOR_SCHEMA = {
  type: "object",
  description: "The next stage of an active catalyst after applying the player's choice.",
  properties: {
    summary: textSchema("Narration of the player's action, reactions, and resulting situation."),
    resolved: {
      type: "boolean",
      description: "Whether the catalyst has reached a definite conclusion.",
    },
    nextChoices: {
      type: "array",
      description: "Two to five choices for an unresolved next stage; empty when resolved.",
      maxItems: 5,
      items: nonEmptyTextSchema("One player choice."),
    },
  },
  required: ["summary", "resolved", "nextChoices"],
  additionalProperties: false,
};

export const CATALYST_SUMMARY_SCHEMA = {
  type: "object",
  description: "A resolved catalyst condensed into one campaign timeline event.",
  properties: {
    title: textSchema("Concise event headline."),
    description: textSchema("Complete but concise account of the catalyst outcome."),
    importance: textSchema("Event importance, normally major."),
  },
  required: ["title", "description", "importance"],
  additionalProperties: false,
};

export const GAME_MASTER_SCHEMA = {
  type: "object",
  description: "A direct game-master intervention and its structured world-state changes.",
  properties: {
    summary: textSchema("Concise account of how the GM request changed the world."),
    impacts: impactsSchema,
  },
  required: ["summary", "impacts"],
  additionalProperties: false,
};

const percentageSchema = (description) => ({
  type: "integer",
  description,
  minimum: 0,
  maximum: 100,
});

export const COUNTRY_STAT_SHEET_SCHEMA = {
  type: "object",
  description: "A complete national statistics sheet for the selected polity.",
  properties: {
    gdpPerCapitaUsd: { type: "number", minimum: 1, description: "GDP per head in international (PPP) US dollars of today, as a plain number. Used once to convert the engine's figures." },
    capital: nonEmptyTextSchema("Capital or primary seat of government."),
    continent: nonEmptyTextSchema("Continent or broad geographic region."),
    government: nonEmptyTextSchema("Government system and ideology."),
    leader: nonEmptyTextSchema("Head of state or government."),
    stability: percentageSchema("National stability from 0 to 100."),
    indices: {
      type: "object",
      properties: {
        sovereignty: percentageSchema("Practical political sovereignty."),
        foodAutonomy: percentageSchema("Domestic food autonomy."),
        energyAutonomy: percentageSchema("Domestic energy autonomy."),
        economicIndependence: percentageSchema("Economic independence."),
        internalSecurity: percentageSchema("Internal security."),
        internationalReputation: percentageSchema("International reputation / standing (0-100)."),
      },
      required: ["sovereignty", "foodAutonomy", "energyAutonomy", "economicIndependence", "internalSecurity", "internationalReputation"],
      additionalProperties: false,
    },
    economy: {
      type: "object",
      properties: {
        gdp: nonEmptyTextSchema("Era-appropriate gross domestic product estimate."),
        gdpGrowth: nonEmptyTextSchema("Annual GDP growth estimate."),
        gdpPerCapita: nonEmptyTextSchema("Era-appropriate GDP per capita estimate."),
        currency: nonEmptyTextSchema("Currency or dominant medium of exchange."),
        inflation: nonEmptyTextSchema("Inflation estimate."),
        unemployment: nonEmptyTextSchema("Unemployment estimate."),
        publicDebt: nonEmptyTextSchema("Public debt estimate."),
        budgetBalance: nonEmptyTextSchema("Budget surplus or deficit estimate."),
      },
      required: ["gdp", "gdpGrowth", "gdpPerCapita", "currency", "inflation", "unemployment", "publicDebt", "budgetBalance"],
      additionalProperties: false,
    },
    gdpBreakdown: {
      type: "object",
      properties: {
        agriculture: percentageSchema("Agriculture share of GDP."),
        industry: percentageSchema("Industry share of GDP."),
        services: percentageSchema("Services share of GDP."),
      },
      required: ["agriculture", "industry", "services"],
      additionalProperties: false,
    },
    // Not generated fresh here — carried forward from the persisted sheet by
    // pinStatSheetToEngine (see economyBridge.js) so a regeneration cannot
    // lose it. Declared here too so the augmented sheet still validates.
    history: {
      type: "array",
      description: "This polity's own permanent record of dated facts, carried forward — never generated fresh by this task.",
      items: { type: "string" },
    },
  },
  required: ["capital", "continent", "government", "leader", "stability", "indices", "economy", "gdpBreakdown"],
  additionalProperties: false,
};

// One-time corrections to the economic engine's era priors (economyBridge.refineSeed).
const pct100 = (description) => ({ type: "number", minimum: 0, maximum: 100, description });
const ECONOMY_SEED_SCHEMA = {
  type: "object",
  description: "Corrections to the starting economies of the listed polities. Only fields being changed; only polities being improved.",
  properties: {
    economies: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        properties: {
          polity: nonEmptyTextSchema("Exact polity name as listed in the priors."),
          population: { type: "number", minimum: 1000, description: "People, whole number." },
          technology: pct100("Know-how."), administrativeReach: pct100("State reach."), monetization: pct100("Money economy share."),
          marketIntegration: pct100("Trade integration."), financialDepth: pct100("Banks and markets."), fiscalCredibility: pct100("Creditor trust."),
          legitimacy: pct100("Acceptance of the state."), openness: pct100("Trade share of output."),
          taxRate: { type: "number", minimum: 0, maximum: 0.9, description: "Rate on the assessed base." },
          investmentShare: { type: "number", minimum: 0, maximum: 0.6, description: "Share of output invested." },
          militaryShareOfOutput: { type: "number", minimum: 0, maximum: 0.8, description: "Share of output on forces in being." },
          civilShareOfOutput: { type: "number", minimum: 0, maximum: 0.8, description: "Share of output on civil spending." },
          atWar: { type: "boolean", description: "Whether total mobilisation is tolerated." },
          sanctionsFaced: { type: "number", minimum: 0, maximum: 1, description: "Share of trade access cut by others." },
          debtShareOfOutput: { type: "number", minimum: 0, maximum: 5, description: "Public debt at this date as a share of a year's output." },
          gdpPerCapitaUsd: { type: "number", minimum: 1, description: "GDP per head in international (PPP) US dollars of today." },
          monetarySystem: {
            type: "object",
            properties: {
              label: textSchema("The money's name."),
              backing: { type: "string", enum: ["none", "commodity", "futureClaims"], description: "What stands behind a unit." },
              issuer: { type: "string", enum: ["mint", "banks", "treasury", "market"], description: "Who creates it." },
              rule: { type: "string", enum: ["discretionary", "taylor", "fixed", "peg", "growthLinked"], description: "How much is created." },
              convertibility: { type: "number", minimum: 0, maximum: 1, description: "Redeemable for the backing." },
            },
            additionalProperties: false,
          },
          note: textSchema("One line on what was corrected and why."),
        },
        required: ["polity"],
        additionalProperties: false,
      },
    },
  },
  required: ["economies"],
  additionalProperties: false,
};

export const GAMEPLAY_SCHEMAS = Object.freeze({
  economySeed: ECONOMY_SEED_SCHEMA,
  actions: ACTIONS_SCHEMA,
  jumpForward: JUMP_FORWARD_SCHEMA,
  autoJumpForward: AUTO_JUMP_FORWARD_SCHEMA,
  descriptionToAction: DESCRIPTION_TO_ACTION_SCHEMA,
  nextSpeaker: NEXT_SPEAKER_SCHEMA,
  eventConsolidator: EVENT_CONSOLIDATOR_SCHEMA,
  catalystCreation: CATALYST_CREATION_SCHEMA,
  catalystExecutor: CATALYST_EXECUTOR_SCHEMA,
  catalystSummary: CATALYST_SUMMARY_SCHEMA,
  gameMaster: GAME_MASTER_SCHEMA,
  countryStatSheet: COUNTRY_STAT_SHEET_SCHEMA,
  idleDiplomacy: IDLE_DIPLOMACY_SCHEMA,
  pregameHistory: PREGAME_HISTORY_SCHEMA,
});

const makeTool = (name, description, schema) => Object.freeze({ name, description, schema });

export const ACTIONS_TOOL = makeTool(
  "submit_actions",
  "Submit strategic topics of concern and their suggested player actions.",
  ACTIONS_SCHEMA,
);

export const JUMP_FORWARD_TOOL = makeTool(
  "submit_jump_result",
  "Submit the events, stop date, summary, resolved-action state, and optional catalyst from a timeline jump.",
  JUMP_FORWARD_SCHEMA,
);

export const AUTO_JUMP_FORWARD_TOOL = makeTool(
  "submit_jump_result",
  "Submit the events and result of an automatic timeline jump that stops at the next notable moment.",
  AUTO_JUMP_FORWARD_SCHEMA,
);

export const DESCRIPTION_TO_ACTION_TOOL = makeTool(
  "submit_description_to_action",
  "Submit the structured action or diplomatic chat command derived from the player's freeform intent.",
  DESCRIPTION_TO_ACTION_SCHEMA,
);

export const NEXT_SPEAKER_TOOL = makeTool(
  "submit_next_speaker",
  "Submit the exact diplomatic chat participant who should speak next.",
  NEXT_SPEAKER_SCHEMA,
);

export const EVENT_CONSOLIDATOR_TOOL = makeTool(
  "submit_event_consolidation",
  "Submit a concise continuity summary of the supplied campaign events and chats.",
  EVENT_CONSOLIDATOR_SCHEMA,
);

export const CATALYST_CREATION_TOOL = makeTool(
  "submit_catalyst_creation",
  "Submit a new interactive catalyst scene and the choices available to the player.",
  CATALYST_CREATION_SCHEMA,
);

export const CATALYST_EXECUTOR_TOOL = makeTool(
  "submit_catalyst_execution",
  "Submit the result of the player's catalyst choice and either new choices or a resolved state.",
  CATALYST_EXECUTOR_SCHEMA,
);

export const CATALYST_SUMMARY_TOOL = makeTool(
  "submit_catalyst_summary",
  "Submit the final campaign event produced by a resolved catalyst.",
  CATALYST_SUMMARY_SCHEMA,
);

export const GAME_MASTER_TOOL = makeTool(
  "submit_game_master",
  "Submit the summary and structured map or world-state effects of a game-master request.",
  GAME_MASTER_SCHEMA,
);

export const COUNTRY_STAT_SHEET_TOOL = makeTool(
  "submit_country_stat_sheet",
  "Submit the complete validated national statistics sheet.",
  COUNTRY_STAT_SHEET_SCHEMA,
);

export const IDLE_DIPLOMACY_TOOL = makeTool(
  "submit_idle_diplomacy",
  "Submit at most one short unprompted diplomatic note to the player, or null for silence.",
  IDLE_DIPLOMACY_SCHEMA,
);

export const PREGAME_HISTORY_TOOL = makeTool(
  "submit_pregame_history",
  "Submit the pre-game backstory events that led up to the campaign's start date.",
  PREGAME_HISTORY_SCHEMA,
);

export const ECONOMY_SEED_TOOL = makeTool(
  "correct_economy_seeds",
  "Correct the economic engine's era priors for the listed polities with their actual history.",
  ECONOMY_SEED_SCHEMA,
);

export const GAMEPLAY_TOOLS = Object.freeze({
  economySeed: ECONOMY_SEED_TOOL,
  actions: ACTIONS_TOOL,
  jumpForward: JUMP_FORWARD_TOOL,
  autoJumpForward: AUTO_JUMP_FORWARD_TOOL,
  descriptionToAction: DESCRIPTION_TO_ACTION_TOOL,
  nextSpeaker: NEXT_SPEAKER_TOOL,
  eventConsolidator: EVENT_CONSOLIDATOR_TOOL,
  catalystCreation: CATALYST_CREATION_TOOL,
  catalystExecutor: CATALYST_EXECUTOR_TOOL,
  catalystSummary: CATALYST_SUMMARY_TOOL,
  gameMaster: GAME_MASTER_TOOL,
  countryStatSheet: COUNTRY_STAT_SHEET_TOOL,
  idleDiplomacy: IDLE_DIPLOMACY_TOOL,
  pregameHistory: PREGAME_HISTORY_TOOL,
});

export const getGameplayTool = (taskKey) => GAMEPLAY_TOOLS[taskKey] ?? null;

const valueType = (value) => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
};

const propertyPath = (path, key) =>
  /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;

const validateAgainstSchema = (schema, value, path) => {
  if (Array.isArray(schema.anyOf)) {
    const errors = schema.anyOf.map((candidate) => validateAgainstSchema(candidate, value, path));
    if (errors.some((error) => !error)) return "";
    return `${path} did not match any allowed schema: ${errors.join(" ")}`;
  }

  const actualType = valueType(value);
  const typeMatches = schema.type === "integer"
    ? actualType === "number" && Number.isInteger(value)
    : !schema.type || actualType === schema.type;
  if (!typeMatches) {
    return `${path} must be ${schema.type}; received ${valueType(value)}.`;
  }

  if ((schema.type === "number" || schema.type === "integer") && !Number.isFinite(value)) {
    return `${path} must be a finite number.`;
  }

  if ((schema.type === "number" || schema.type === "integer") && Number.isFinite(schema.minimum) && value < schema.minimum) {
    return `${path} must be at least ${schema.minimum}.`;
  }

  if ((schema.type === "number" || schema.type === "integer") && Number.isFinite(schema.maximum) && value > schema.maximum) {
    return `${path} must be at most ${schema.maximum}.`;
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    return `${path} must be one of ${schema.enum.map((entry) => JSON.stringify(entry)).join(", ")}.`;
  }

  if (schema.type === "string" && Number.isFinite(schema.minLength) && value.length < schema.minLength) {
    return `${path} must contain at least ${schema.minLength} character${schema.minLength === 1 ? "" : "s"}.`;
  }

  if (schema.type === "array") {
    if (Number.isFinite(schema.minItems) && value.length < schema.minItems) {
      return `${path} must contain at least ${schema.minItems} item${schema.minItems === 1 ? "" : "s"}.`;
    }
    if (Number.isFinite(schema.maxItems) && value.length > schema.maxItems) {
      return `${path} must contain at most ${schema.maxItems} items.`;
    }

    for (let index = 0; index < value.length; index += 1) {
      const error = validateAgainstSchema(schema.items ?? {}, value[index], `${path}[${index}]`);
      if (error) return error;
    }
  }

  if (schema.type === "object") {
    const properties = schema.properties ?? {};

    for (const key of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        return `${propertyPath(path, key)} is required.`;
      }
    }

    for (const [key, entry] of Object.entries(value)) {
      const childSchema = properties[key];
      if (!childSchema) {
        if (schema.additionalProperties === false) {
          return `${propertyPath(path, key)} is not allowed.`;
        }
        continue;
      }

      const error = validateAgainstSchema(childSchema, entry, propertyPath(path, key));
      if (error) return error;
    }
  }

  return "";
};

const hasMeaningfulCatalyst = (value) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  ([value.title, value.premise, value.opening].some(
    (entry) => typeof entry === "string" && entry.trim().length > 0,
  ) ||
    (Array.isArray(value.choices) && value.choices.length > 0));

const validateDistinctChoices = (choices, path) => {
  const normalized = choices.map((choice) => choice.trim().toLocaleLowerCase());
  const blankIndex = normalized.findIndex((choice) => !choice);
  if (blankIndex >= 0) return `${path}[${blankIndex}] must not be blank.`;
  if (new Set(normalized).size !== normalized.length) return `${path} must contain distinct choices.`;
  return "";
};

const findBlankString = (value, path = "$") => {
  if (typeof value === "string") return value.trim() ? "" : `${path} must not be blank.`;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const error = findBlankString(value[index], `${path}[${index}]`);
      if (error) return error;
    }
  } else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      const error = findBlankString(entry, propertyPath(path, key));
      if (error) return error;
    }
  }
  return "";
};

export const validateGameplayPayload = (taskKey, value) => {
  const schema = GAMEPLAY_SCHEMAS[taskKey];
  if (!schema) {
    return {
      valid: false,
      error: `Unknown gameplay task key: ${String(taskKey)}.`,
    };
  }

  const error = validateAgainstSchema(schema, value, "$");
  if (error) {
    return { valid: false, error };
  }

  if (taskKey === "jumpForward" || taskKey === "autoJumpForward") {
    if (!value.stopDate.trim()) {
      return { valid: false, error: "$.stopDate must not be empty." };
    }
    for (let index = 0; index < value.events.length; index += 1) {
      const event = value.events[index];
      for (const field of ["date", "title", "description"]) {
        if (!event[field].trim()) {
          return { valid: false, error: `$.events[${index}].${field} must not be empty.` };
        }
      }
    }
    const hasEvents = value.events.length > 0;
    const hasSummary = value.summary.trim().length > 0;
    if (!hasEvents && !hasSummary && !hasMeaningfulCatalyst(value.catalyst)) {
      return {
        valid: false,
        error: "Jump payload must contain at least one event, a nonempty summary, or a meaningful catalyst.",
      };
    }
    if (value.catalyst) {
      const catalystError = validateDistinctChoices(value.catalyst.choices, "$.catalyst.choices");
      if (catalystError) return { valid: false, error: catalystError };
    }
  }

  if (taskKey === "pregameHistory") {
    for (let index = 0; index < value.events.length; index += 1) {
      const event = value.events[index];
      for (const field of ["date", "title", "description"]) {
        if (!event[field].trim()) {
          return { valid: false, error: `$.events[${index}].${field} must not be empty.` };
        }
      }
    }
    if (!value.summary.trim()) {
      return { valid: false, error: "$.summary must not be empty." };
    }
  }

  const requiredTextByTask = {
    descriptionToAction: ["title", "text", "kind"],
    nextSpeaker: ["nextSpeaker"],
    eventConsolidator: ["summary"],
    catalystCreation: ["title", "premise", "opening"],
    catalystExecutor: ["summary"],
    catalystSummary: ["title", "description", "importance"],
    gameMaster: ["summary"],
  };
  for (const field of requiredTextByTask[taskKey] ?? []) {
    if (!value[field].trim()) {
      return { valid: false, error: `$.${field} must not be empty.` };
    }
  }

  if (taskKey === "catalystCreation") {
    const choiceError = validateDistinctChoices(value.choices, "$.choices");
    if (choiceError) return { valid: false, error: choiceError };
  }

  if (taskKey === "catalystExecutor") {
    if (value.resolved && value.nextChoices.length !== 0) {
      return { valid: false, error: "$.nextChoices must be empty when $.resolved is true." };
    }
    if (!value.resolved && value.nextChoices.length < 2) {
      return { valid: false, error: "$.nextChoices must contain between 2 and 5 choices while unresolved." };
    }
    const choiceError = validateDistinctChoices(value.nextChoices, "$.nextChoices");
    if (choiceError) return { valid: false, error: choiceError };
  }

  if (taskKey === "countryStatSheet") {
    const blankError = findBlankString(value);
    if (blankError) return { valid: false, error: blankError };
    const breakdown = value.gdpBreakdown;
    if (breakdown.agriculture + breakdown.industry + breakdown.services !== 100) {
      return { valid: false, error: "$.gdpBreakdown percentages must sum to 100." };
    }
  }

  if (taskKey === "actions") {
    let contested = 0;
    for (let topicIndex = 0; topicIndex < value.topics.length; topicIndex += 1) {
      const topic = value.topics[topicIndex];
      if (!topic.title.trim()) return { valid: false, error: `$.topics[${topicIndex}].title must not be empty.` };
      for (let actionIndex = 0; actionIndex < topic.actions.length; actionIndex += 1) {
        const action = topic.actions[actionIndex];
        if (!action.title.trim() || !action.text.trim()) {
          return { valid: false, error: `$.topics[${topicIndex}].actions[${actionIndex}] must have nonempty title and text.` };
        }
      }
      // A topic that names a dilemma must actually offer distinct philosophies:
      // two or more options, each with its own stance, none repeated.
      const stances = topic.actions.map((a) => String(a.stance ?? "").trim().toLowerCase()).filter(Boolean);
      if (String(topic.dilemma ?? "").trim()) {
        if (stances.length < 2 || stances.length !== topic.actions.length || new Set(stances).size !== stances.length) {
          return { valid: false, error: `$.topics[${topicIndex}] names a dilemma, so every option under it needs its own distinct stance, and there must be at least two.` };
        }
        contested += 1;
      }
    }
    // Some topics must force a real choice, whatever the polity or the era.
    if (value.topics.length >= 2 && contested === 0) {
      return { valid: false, error: "At least one topic must set genuinely different philosophies against each other: give it a dilemma and a distinct stance on each of its options." };
    }
  }

  return { valid: true, error: "" };
};

// ── Ce que ce jeu n'utilise pas ──────────────────────────────────────────────
//
// « Retirer tout ce que le jeu n'utilise pas comme jeton. »
//
// Mesuré chez le joueur, palier gratuit, Gemini 3.5 Flash Lite : requêtes par
// minute 13/15, par jour 284/500, et JETONS PAR MINUTE 339 950 pour un plafond
// de 250 000. C'est la seule des trois qui saute, et le schéma du tour y entre
// pour 11 462 jetons — envoyés avant le moindre mot de contenu, à chaque appel.
//
// Ventilé, `impacts` en porte 10 214. Quatre leviers y décrivent une guerre sur
// une carte : des bataillons, des bases et des ports posés au sol, des régions
// qui changent de maître, des guerres livrées. Ce jeu se lit dans un journal.
// Le pape n'a pas d'armée — « lever une armée » est d'ailleurs le seul ordre que
// le moteur juge BLOQUÉ — et la carte ne paraît que dans l'éditeur de scénario,
// derrière le menu ⋮. Le modèle payait donc 2 266 jetons par tour pour se voir
// offrir des leviers qu'il ne pouvait pas actionner.
//
// Ce n'est pas une amputation du moteur : la coupe est CONDITIONNELLE. Un monde
// qui tient des unités, ou dont le joueur commande une armée, reçoit le schéma
// entier. Un scénario à carte joué dans ce dépôt marche donc comme avant.
export const LEVIERS_DE_CARTE = Object.freeze(["unitOps", "markerOps", "warOps", "regionTransfers"]);

/**
 * Le même outil, privé des leviers nommés. Rend l'outil TEL QUEL quand il n'y a
 * rien à retirer, pour que le cas courant ne recopie pas le schéma pour rien.
 */
export const outilSansLeviers = (tool, leviers = []) => {
  const aRetirer = new Set(leviers);
  const impacts = tool?.schema?.properties?.events?.items?.properties?.impacts;
  if (!aRetirer.size || !impacts?.properties) return tool;
  const restants = Object.fromEntries(
    Object.entries(impacts.properties).filter(([k]) => !aRetirer.has(k)),
  );
  if (Object.keys(restants).length === Object.keys(impacts.properties).length) return tool;
  return Object.freeze({
    ...tool,
    schema: {
      ...tool.schema,
      properties: {
        ...tool.schema.properties,
        events: {
          ...tool.schema.properties.events,
          items: {
            ...tool.schema.properties.events.items,
            properties: {
              ...tool.schema.properties.events.items.properties,
              impacts: { ...impacts, properties: restants },
            },
          },
        },
      },
    },
  });
};

/**
 * Si ce monde se joue sur une carte. Un monde qui tient des unités, ou dont un
 * scénario déclare des transferts de régions, en est un ; le Saint-Siège n'en
 * est pas un. Dans le doute — un monde qu'on n'a pas pu lire — on répond OUI,
 * parce que le coût d'un schéma trop gros est une lenteur, et celui d'un schéma
 * trop petit un levier que le monde ne peut plus actionner.
 */
export const laCarteEstEnJeu = (world) => {
  if (!world || typeof world !== "object") return true;
  if (Array.isArray(world.units) && world.units.length > 0) return true;
  if (Array.isArray(world.wars) && world.wars.length > 0) return true;
  return false;
};
