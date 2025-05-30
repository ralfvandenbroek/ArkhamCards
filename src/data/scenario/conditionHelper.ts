import {
  every,
  filter,
  find,
  findIndex,
  forEach,
  keys,
  map,
  sumBy,
  maxBy,
  values,
} from 'lodash';

import { StringChoices } from '@actions/types';
import {
  BinaryCardCondition,
  CardCondition,
  PartnerStatusCondition,
  CampaignLogCondition,
  CampaignLogCardsCondition,
  CampaignDataCondition,
  CampaignDataScenarioCondition,
  CampaignDataChaosBagCondition,
  CampaignDataVersionCondition,
  MultiCondition,
  CampaignDataInvestigatorCondition,
  CampaignDataInvestigatorStatusCondition,
  CampaignLogSectionExistsCondition,
  CheckSuppliesCondition,
  CheckSuppliesAllCondition,
  CheckSuppliesAnyCondition,
  InvestigatorCardCondition,
  InvestigatorCondition,
  KilledTraumaCondition,
  MathEqualsCondition,
  BasicTraumaCondition,
  StringOption,
  Condition,
  BoolOption,
  NumOption,
  Option,
  Operand,
  DefaultOption,
  CampaignLogCountCondition,
  CampaignLogInvestigatorCountCondition,
  MathCondition,
  CampaignLogCardsSwitchCondition,
  ScenarioDataFixedInvestigatorStatusCondition,
  InvestigatorChoiceCondition,
  ScenarioDataInvestigatorStatusCondition,
  CampaignDataNextScenarioCondition,
  LocationCondition,
  ScarletKeyCondition,
  ScarletKeyCountCondition,
  CampaignDataStandaloneCondition,
  InvestigatorCampaignLogCardsCondition,
  CampaignLogTaskCondition,
} from './types';
import GuidedCampaignLog from './GuidedCampaignLog';
import Card from '@data/types/Card';
import BinaryResult from '@components/campaignguide/BinaryResult';

export interface BinaryResult {
  type: 'binary';
  decision: boolean;
  option?: Option;
  input?: string[];
  numberInput?: number[];
}

export interface NumberResult {
  type: 'number';
  number: number;
  option?: Option;
}

export interface StringResult {
  type: 'string';
  string: string;
  option?: Option;
}

export type OptionWithId = Option & { id: string };
export type BoolOptionWithId = BoolOption & { id: string };

export interface InvestigatorResult {
  type: 'investigator';
  investigatorChoices: StringChoices;
  options: OptionWithId[];
}

export interface InvestigatorCardResult {
  type: 'investigator';
  investigatorChoices: StringChoices;
  options: BoolOptionWithId[];
}

export type ConditionResult =
  BinaryResult |
  NumberResult |
  StringResult |
  InvestigatorResult;

function binaryConditionResult(
  result: boolean,
  options: BoolOption[],
  input?: string[],
  numberInput?: number[]
): BinaryResult {
  const ifTrue = find(options, option => option.boolCondition === true);
  const ifFalse = find(options, option => option.boolCondition === false);
  return {
    type: 'binary',
    decision: result,
    option: result ? ifTrue : ifFalse,
    input,
    numberInput,
  };
}

function numberConditionResult(
  value: number,
  options: NumOption[],
  defaultOption?: DefaultOption
): NumberResult {
  const choice =
    find(options, option => option.numCondition === value) ||
    defaultOption;
  return {
    type: 'number',
    number: value,
    option: choice,
  };
}

function stringConditionResult(
  value: string,
  options: Option[],
  defaultOption?: DefaultOption
): StringResult {
  const choice =
    find(options, option => option.condition === value) ||
    defaultOption;
  return {
    type: 'string',
    string: value,
    option: choice,
  };
}

function investigatorResult(
  investigatorChoices: StringChoices,
  options: OptionWithId[]
): InvestigatorResult {
  return {
    type: 'investigator',
    investigatorChoices,
    options: filter(options, option => !!find(investigatorChoices, (choices) => !!find(choices, choice => choice === option.id))),
  };
}

function investigatorCardResult(
  investigatorChoices: StringChoices,
  options: BoolOptionWithId[]
): InvestigatorCardResult {
  return {
    type: 'investigator',
    investigatorChoices,
    options,
  };
}

export function getOperand(
  op: Operand,
  campaignLog: GuidedCampaignLog
): number {
  switch (op.type) {
    case 'campaign_log_count':
      return campaignLog.count(op.section, op.id || '$count');
    case 'campaign_log_task':
      return campaignLog.task(op.section, op.id);
    case 'chaos_bag':
      return campaignLog.chaosBag[op.token] || 0;
    case 'constant':
      return op.value;
    case 'most_xp_earned': {
      const investigators = campaignLog.investigatorCodes(false);
      const topCode = maxBy(investigators, code => campaignLog.earnedXp(code));
      return topCode ? campaignLog.earnedXp(topCode) : 0;
    }
    case 'partner_status': {
      const partnerResult = partnerStatusConditionResult(op, campaignLog);
      return keys(partnerResult.investigatorChoices).length;
    }
    case 'scenario_data': {
      if (op.scenario_data === 'player_count') {
        return campaignLog.playerCount();
      }
      return 0;
    }
  }
}

export function checkSuppliesConditionResult(
  condition: CheckSuppliesCondition,
  campaignLog: GuidedCampaignLog
): BinaryResult | InvestigatorResult {
  switch (condition.investigator) {
    case 'any':
      return checkSuppliesAnyConditionResult(condition, campaignLog);
    case 'all':
      return checkSuppliesAllConditionResult(condition, campaignLog);
  }
}

export function checkSuppliesAnyConditionResult(
  condition: CheckSuppliesAnyCondition,
  campaignLog: GuidedCampaignLog
): BinaryResult {
  const investigatorSupplies = campaignLog.investigatorSections[condition.section] || {};
  const investigators = campaignLog.investigators(false);
  return binaryConditionResult(
    !!find(investigators, investigator => {
      const supplies = investigatorSupplies[investigator.code] || {};
      return !!find(supplies.entries, entry => (
        entry.id === condition.id && !entry.crossedOut && entry.type === 'count' && entry.count > 0
      ));
    }),
    condition.options
  );
}

export function checkSuppliesAllConditionResult(
  condition: CheckSuppliesAllCondition,
  campaignLog: GuidedCampaignLog
): InvestigatorCardResult {
  const investigatorSupplies = campaignLog.investigatorSections[condition.section] || {};
  const choices: StringChoices = {};
  forEach(campaignLog.investigators(false), investigator => {
    choices[investigator.code] = ['false'];
  });
  forEach(investigatorSupplies, (supplies, investigatorCode) => {
    const hasSupply = !!find(supplies.entries,
      entry => entry.id === condition.id && !entry.crossedOut && entry.type === 'count' && entry.count > 0
    );
    const index = findIndex(
      condition.options,
      option => option.boolCondition === hasSupply
    );
    if (index !== -1) {
      choices[investigatorCode] = [hasSupply ? 'true' : 'false'];
    }
  });
  const options: BoolOptionWithId[] = map(condition.options, option => {
    return {
      ...option,
      id: option.boolCondition ? 'true' : 'false',
    };
  });
  return investigatorCardResult(choices, options);
}

export function investigatorCampaignLogCardsResult(
  condition: InvestigatorCampaignLogCardsCondition,
  campaignLog: GuidedCampaignLog
): BinaryResult {
  const investigators = campaignLog.investigatorCodes(true);
  const cards = new Set(campaignLog.allCards(condition.section, condition.id) ?? []);
  const eligibleInvestigators = filter(investigators, code => condition.option.boolCondition ? cards.has(code) : !cards.has(code));
  return {
    type: 'binary',
    decision: !!eligibleInvestigators.length,
    option: eligibleInvestigators.length ? condition.option : undefined,
    input: eligibleInvestigators,
  };
}

export function campaignLogConditionResult(
  condition: CampaignLogSectionExistsCondition | CampaignLogCondition | CampaignLogCardsCondition | CampaignLogTaskCondition,
  campaignLog: GuidedCampaignLog
): BinaryResult {
  switch (condition.type) {
    case 'campaign_log':
      return binaryConditionResult(
        campaignLog.check(condition.section, condition.id),
        condition.options
      );
    case 'campaign_log_section_exists':
      return binaryConditionResult(
        campaignLog.sectionExists(condition.section),
        condition.options
      );
    case 'campaign_log_cards':
      return binaryConditionResult(
        campaignLog.check(condition.section, condition.id),
        condition.options,
        campaignLog.allCards(condition.section, condition.id),
        campaignLog.allCardCounts(condition.section, condition.id)
      );
    case 'campaign_log_task': {
      const investigator = campaignLog.taskAssignee(condition.section, condition.id);
      const count = campaignLog.task(condition.section, condition.id);
      return binaryConditionResult(
        !!investigator,
        condition.options,
        investigator ? [investigator] : [],
        [count]
      );
    }
  }
}
export function campaignLogCardsSwitchResult(
  condition: CampaignLogCardsSwitchCondition,
  campaignLog: GuidedCampaignLog
): StringResult {
  const cards = campaignLog.allCards(condition.section, condition.id);
  const cardsSet = new Set(cards || []);
  const choice = find(condition.options, option => cardsSet.has(option.condition));
  return {
    type: 'string',
    string: (cards && cards.length && cards[0]) || '',
    option: choice,
  };
}

function checkTraumaCondition(
  code: string,
  trauma: 'killed' | 'insane' | 'alive',
  campaignLog: GuidedCampaignLog
) {
  switch(trauma) {
    case 'killed': return campaignLog.isKilled(code);
    case 'insane': return campaignLog.isInsane(code);
    case 'alive': return !campaignLog.isKilled(code) && !campaignLog.isInsane(code);
  }
}

export function killedTraumaConditionResult(
  condition: KilledTraumaCondition,
  campaignLog: GuidedCampaignLog
): BinaryResult {
  switch (condition.investigator) {
    case 'lead_investigator': {
      const investigator = campaignLog.leadInvestigatorChoice();
      return binaryConditionResult(
        checkTraumaCondition(investigator, condition.trauma, campaignLog),
        condition.options
      );
    }
    case 'all': {
      // Explicitly checking if they are all killed, so we want eliminated ones.
      const investigators = campaignLog.investigatorCodes(true);
      return binaryConditionResult(
        investigators.length === 0 || every(
          investigators,
          code => checkTraumaCondition(code, condition.trauma, campaignLog)
        ),
        condition.options
      );
    }
  }
}

export function mathEqualsConditionResult(
  condition: MathEqualsCondition,
  campaignLog: GuidedCampaignLog
) {
  const opA = getOperand(condition.opA, campaignLog);
  const opB = getOperand(condition.opB, campaignLog);
  return binaryConditionResult(
    opA === opB,
    condition.options
  );
}

export function partnerStatusConditionResult(
  condition: PartnerStatusCondition,
  campaignLog: GuidedCampaignLog
): InvestigatorResult {
  const allPartners = filter(
    campaignLog.campaignGuide.campaignLogPartners(condition.section),
    p => condition.partner === 'any' || condition.fixed_partner === p.code);

  const choices: StringChoices = {};
  forEach(allPartners, partner => {
    const decision = condition.operation === 'any' ?
      !!find(condition.status, s => campaignLog.hasPartnerStatus(condition.section, partner, s)) :
      !!every(condition.status, s => campaignLog.hasPartnerStatus(condition.section, partner, s));
    const index = findIndex(condition.options, option => option.boolCondition === decision);
    if (index !== -1) {
      choices[partner.code] = [decision ? 'true' : 'false'];
    }
  });
  return investigatorResult(
    choices,
    map(condition.options, option => {
      return {
        ...option,
        id: option.boolCondition ? 'true' : 'false',
      };
    })
  );
}

function basicTrauma(
  code: string,
  trauma: 'mental' | 'physical' | 'alive',
  campaignLog: GuidedCampaignLog
) {
  switch (trauma) {
    case 'mental': return campaignLog.hasMentalTrauma(code);
    case 'physical': return campaignLog.hasPhysicalTrauma(code);
    case 'alive': return !campaignLog.isInsane(code) && !campaignLog.isKilled(code);
  }
}

export function basicTraumaConditionResult(
  condition: BasicTraumaCondition,
  campaignLog: GuidedCampaignLog
): InvestigatorResult {
  switch (condition.investigator) {
    case 'each': {
      const choices: StringChoices = {};
      const investigators = campaignLog.investigatorCodes(false);
      forEach(investigators, investigator => {
        const decision = basicTrauma(investigator, condition.trauma, campaignLog);
        const index = findIndex(condition.options, option => option.boolCondition === decision);
        if (index !== -1) {
          choices[investigator] = [decision ? 'true' : 'false'];
        }
      });
      return investigatorResult(
        choices,
        map(condition.options, option => {
          return {
            ...option,
            id: option.boolCondition ? 'true' : 'false',
          };
        })
      );
    }
  }
}

export function hasCardConditionResult(
  condition: CardCondition,
  campaignLog: GuidedCampaignLog
): InvestigatorCardResult | BinaryResult {
  if (condition.investigator === 'each') {
    return investigatorCardConditionResult(condition, campaignLog);
  }
  return binaryCardConditionResult(condition, campaignLog);
}

export function binaryCardConditionResult(
  condition: BinaryCardCondition,
  campaignLog: GuidedCampaignLog
): BinaryResult {
  // Card conditions still care about killed investigators.
  const investigators = campaignLog.investigatorCodes(true);
  const investigatorsWithCard = filter(investigators, code => {
    switch (condition.investigator) {
      case 'defeated':
        if (!campaignLog.isDefeated(code)) {
          return false;
        }
        break;
      case 'any':
        break;
    }
    return campaignLog.hasCard(code, condition.card);
  })
  return binaryConditionResult(
    !!investigatorsWithCard.length,
    condition.options,
    investigatorsWithCard
  );
}

export function investigatorCardConditionResult(
  condition: InvestigatorCardCondition,
  campaignLog: GuidedCampaignLog
): InvestigatorCardResult {
  const investigators = campaignLog.investigatorCodes(false);
  const choices: StringChoices = {};
  forEach(investigators, code => {
    const decision = campaignLog.hasCard(
      code,
      condition.card
    );
    const index = findIndex(condition.options, option => option.boolCondition === decision);
    if (index !== -1) {
      choices[code] = [decision ? 'true' : 'false'];
    }
  });
  const options: BoolOptionWithId[] = map(
    condition.options,
    option => {
      return {
        ...option,
        id: option.boolCondition ? 'true' : 'false',
      };
    }
  );
  return investigatorCardResult(choices, options);
}

function investigatorDataMatches(
  card: Card,
  field: 'trait' | 'faction' | 'code',
  value: string
): boolean {
  switch (field) {
    case 'trait':
      return !!card.real_traits_normalized &&
        card.real_traits_normalized.indexOf(`#${value.toLowerCase()}#`) !== -1;
    case 'faction':
      return card.factionCode() === value;
    case 'code':
      return card.code === value;
  }
}

export function campaignDataScenarioConditionResult(
  condition: CampaignDataScenarioCondition | CampaignDataNextScenarioCondition,
  campaignLog: GuidedCampaignLog
): BinaryResult {
  switch (condition.campaign_data) {
    case 'next_scenario': {
      const hasNextScenario = !!campaignLog.campaignData.nextScenario.length;
      const currentScenarioId = campaignLog.scenarioId ? campaignLog.campaignGuide.parseScenarioId(campaignLog.scenarioId) : undefined;
      const replayRequired = !!currentScenarioId && (
        (currentScenarioId.replayAttempt || 0) < (campaignLog.campaignData.scenarioReplayCount[currentScenarioId.scenarioId] || 0)
      );
      return binaryConditionResult(hasNextScenario || replayRequired, condition.options);
    }
    case 'scenario_completed':
      return binaryConditionResult(
        campaignLog.scenarioStatus(condition.scenario) === 'completed',
        condition.options
      );
    case 'scenario_replayed': {
      const replayCount = campaignLog.campaignData.scenarioReplayCount[condition.scenario] || 0;
      return binaryConditionResult(
        replayCount > 0,
        condition.options
      );
    }
  }
}

function investigatorConditionMatches(
  investigatorData: 'trait' | 'faction' | 'code',
  options: StringOption[],
  excludeInvestigators: string[] | undefined,
  campaignLog: GuidedCampaignLog
): InvestigatorResult {
  const investigators = campaignLog.investigators(false);
  const investigatorChoices: StringChoices = {};
  const excluded = new Set(excludeInvestigators || []);
  for (let i = 0; i < investigators.length; i++) {
    const card = investigators[i];
    if (excluded.has(card.code)) {
      continue;
    }
    const matches = filter(
      options,
      option => investigatorDataMatches(card.card, investigatorData, option.condition)
    );
    if (matches.length) {
      investigatorChoices[card.code] = map(matches, match => match.condition);
    }
  }
  return investigatorResult(
    investigatorChoices,
    map(options, option => {
      return {
        ...option,
        id: option.condition,
      };
    })
  );
}

export function investigatorConditionResult(
  condition: InvestigatorCondition,
  campaignLog: GuidedCampaignLog
): InvestigatorResult {
  return investigatorConditionMatches(
    condition.investigator_data,
    condition.options,
    undefined,
    campaignLog
  );
}

export function campaignDataChaosBagConditionResult(
  condition: CampaignDataChaosBagCondition,
  campaignLog: GuidedCampaignLog
): NumberResult {
  const chaosBag = campaignLog.chaosBag;
  const tokenCount: number = chaosBag[condition.token] || 0;
  return numberConditionResult(
    tokenCount,
    condition.options,
    condition.default_option
  );
}

export function campaignDataInvestigatorConditionResult(
  condition: CampaignDataInvestigatorCondition,
  campaignLog: GuidedCampaignLog
): BinaryResult {
  const result = investigatorConditionMatches(
    condition.investigator_data,
    condition.options,
    condition.exclude_investigators,
    campaignLog
  );
  let match: OptionWithId | undefined = undefined;
  const input: string[] = [];
  forEach(result.investigatorChoices, (choices, code) => {
    if (choices.length) {
      match = find(result.options, option => option.id === choices[0]);
      input.push(code);
    }
  });
  if (match) {
    return {
      type: 'binary',
      decision: true,
      option: match,
      input,
    };
  }
  return {
    type: 'binary',
    decision: false,
    option: condition.default_option,
  };
}


export function campaignDataInvestigatorStatusConditionResult(
  condition: CampaignDataInvestigatorStatusCondition,
  campaignLog: GuidedCampaignLog
): BinaryResult {
  const investigators = campaignLog.investigators(true);
  const decision = !!find(investigators, investigator => {
    switch (condition.status) {
      case 'not_eliminated':
        return !campaignLog.isEliminated(investigator);
    }
  });
  return binaryConditionResult(
    decision,
    condition.options
  );
}

export function campaignDataVersionConditionResult(
  condition: CampaignDataVersionCondition,
  campaignLog: GuidedCampaignLog
): BinaryResult {
  return binaryConditionResult(
    campaignLog.guideVersion >= condition.min_version,
    condition.options
  );
}

export function campaignDataConditionResult(
  condition: CampaignDataCondition,
  campaignLog: GuidedCampaignLog
): BinaryResult | StringResult | NumberResult {
  switch (condition.campaign_data) {
    case 'linked_campaign': {
      return binaryConditionResult(
        campaignLog.linked,
        condition.options
      );
    }
    case 'version':
      return campaignDataVersionConditionResult(
        condition,
        campaignLog
      );
    case 'cycle':
      return stringConditionResult(
        campaignLog.campaignGuide.campaignCycleCode(),
        condition.options
      );
    case 'scenario_replayed':
    case 'next_scenario':
    case 'scenario_completed': {
      return campaignDataScenarioConditionResult(condition, campaignLog);
    }
    case 'difficulty': {
      return stringConditionResult(
        campaignLog.campaignData.difficulty || 'standard',
        condition.options
      );
    }
    case 'standalone': {
      return campaignDataStandaloneConditionResult(condition, campaignLog);
    }
    case 'chaos_bag': {
      return campaignDataChaosBagConditionResult(condition, campaignLog);
    }
    case 'investigator_status':
      return campaignDataInvestigatorStatusConditionResult(condition, campaignLog);
    case 'investigator':
      return campaignDataInvestigatorConditionResult(condition, campaignLog);
  }
}

export function campaignDataStandaloneConditionResult(condition: CampaignDataStandaloneCondition, campaignLog: GuidedCampaignLog): BinaryResult {
  return binaryConditionResult(
    campaignLog.campaignData.standalone,
    condition.options,
  );
}
export function multiConditionResult(
  condition: MultiCondition,
  campaignLog: GuidedCampaignLog
): BinaryResult {
  const count = sumBy(
    condition.conditions,
    subCondition => {
      switch (subCondition.type) {
        case 'has_card':
          if (subCondition.investigator === 'each') {
            return investigatorCardConditionResult(subCondition, campaignLog).options ? 1 : 0;
          }
          return binaryCardConditionResult(subCondition, campaignLog).option ? 1 : 0;
        case 'campaign_log_cards':
        case 'campaign_log':
        case 'campaign_log_section_exists':
          return campaignLogConditionResult(subCondition, campaignLog).option ? 1 : 0;
        case 'campaign_log_count':
          return campaignLogCountConditionResult(subCondition, campaignLog).option ? 1 : 0;
        case 'campaign_data': {
          switch (subCondition.campaign_data) {
            case 'chaos_bag':
            case 'version':
            case 'scenario_completed':
            case 'scenario_replayed':
            case 'next_scenario':
            case 'investigator':
            case 'investigator_status':
            case 'cycle':
            case 'standalone':
            case 'difficulty':
              return campaignDataConditionResult(subCondition, campaignLog).option ? 1 : 0;
          }
        }
        case 'scarlet_key':
          return scarletKeyConditionResult(subCondition, campaignLog).option ? 1 : 0;
        case 'scarlet_key_count':
          return scarletKeyCountConditionResult(subCondition, campaignLog).option ? 1 : 0;
        case 'scenario_data': {
          switch (subCondition.scenario_data) {
            case 'resolution':
              return stringConditionResult(
                campaignLog.resolution(),
                subCondition.options
              ).option ? 1 : 0;
            case 'player_count':
              return numberConditionResult(
                campaignLog.playerCount(),
                subCondition.options
              ).option ? 1 : 0;
            case 'investigator_status':
              return investigatorStatusConditionResult(subCondition, campaignLog).option ? 1 : 0;
          }
        }
        case 'math':
          return mathConditionResult(subCondition, campaignLog).option ? 1 : 0;
        case 'trauma':
          return basicTraumaConditionResult(subCondition, campaignLog).options.length ? 1 : 0;
        case 'partner_status':
          return partnerStatusConditionResult(subCondition, campaignLog).options.length ? 1 : 0;
      }
    });
  return binaryConditionResult(
    count >= condition.count,
    condition.options
  );
}

export function campaignLogCountConditionResult(condition: CampaignLogCountCondition, campaignLog: GuidedCampaignLog) {
  return numberConditionResult(
    campaignLog.count(condition.section, condition.id),
    condition.options,
    condition.default_option
  );
}


export function campaignLogInvestigatorCountConditionResult(condition: CampaignLogInvestigatorCountCondition, campaignLog: GuidedCampaignLog): InvestigatorResult | BinaryResult {
  const section = campaignLog.investigatorSections[condition.section] || {};
  const investigators = campaignLog.investigatorCodes(false);
  switch (condition.investigator) {
    case 'any': {
      const scenarionInvestigators = investigators;
      // Basically find the first option that matches *any* investigator;
      const option = find(condition.options, o => {
        return !!find(scenarionInvestigators, code => {
          const entrySection = section[code];
          const entry = find(entrySection?.entries || [], entry => entry.id === '$count' && entry.type === 'count');
          const count = (entry?.type === 'count' && entry.count) || 0;
          return o.numCondition === count;
        });
      });
      return {
        type: 'binary',
        decision: !!option,
        option: option || condition.default_option,
      };
    }
    case 'all': {
      const investigatorChoices: StringChoices = {};
      for (let i = 0; i < investigators.length; i++) {
        const investigator = investigators[i];
        const countEntry = find(section[investigator]?.entries || [], entry => entry.id === '$count' && entry.type === 'count');
        const count = (countEntry?.type === 'count' && countEntry.count) || 0;
        const matches = filter(condition.options, option => option.numCondition === count);
        if (matches.length) {
          investigatorChoices[investigator] = map(matches, match => `${match.numCondition}`);
        } else if (condition.default_option) {
          investigatorChoices[investigator] = ['default'];
        }
      }
      return investigatorResult(
        investigatorChoices,
        [
          ...map(condition.options, option => {
            return {
              ...option,
              id: `${option.numCondition}`,
            };
          }),
          ...(condition.default_option ? [{
            ...condition.default_option,
            id: 'default',
          }] : []),
        ]
      );
    }
  }
}

function mathConditionResult(condition: MathCondition, campaignLog: GuidedCampaignLog): BinaryResult | NumberResult {
  switch (condition.operation) {
    case 'equals':
      return mathEqualsConditionResult(condition, campaignLog);
    case 'sum':
    case 'divide': {
      const opA = getOperand(condition.opA, campaignLog);
      const opB = getOperand(condition.opB, campaignLog);
      return numberConditionResult(
        condition.operation === 'sum' ? (opA + opB) : Math.floor(opA / opB),
        condition.options,
        condition.default_option
      );
    }
    case 'compare': {
      const opA = getOperand(condition.opA, campaignLog);
      const opB = getOperand(condition.opB, campaignLog);
      const value = opA - opB;
      const choice = find(condition.options, option => {
        if (value < 0) {
          return option.numCondition === -1;
        }
        if (value === 0) {
          return option.numCondition === 0;
        }
        return option.numCondition === 1;
      });
      return {
        type: 'number',
        number: value,
        option: choice,
      };
    }
  }
}

export function fixedInvestigatorStatusConditionResult(condition: ScenarioDataFixedInvestigatorStatusCondition, campaignLog: GuidedCampaignLog): BinaryResult {
  const investigators = campaignLog.getInvestigators(condition.status);
  const result = !!find(investigators, condition.fixed_investigator);
  return binaryConditionResult(result, condition.options);
}

export function investigatorStatusConditionResult(condition: ScenarioDataInvestigatorStatusCondition, campaignLog: GuidedCampaignLog): BinaryResult {
  const investigators = campaignLog.investigatorCodes(false);
  const decision = !!find(investigators, code => {
    switch (condition.investigator) {
      case 'defeated':
        return campaignLog.isDefeated(code);
      case 'not_defeated':
        return !campaignLog.isDefeated(code);
      case 'resigned':
        return campaignLog.resigned(code);
      case 'not_resigned':
        return !campaignLog.resigned(code);
      case 'alive':
        return campaignLog.isAlive(code);
    }
  });
  return binaryConditionResult(
    decision,
    condition.options
  );
}

export function conditionResult(
  condition: Condition,
  campaignLog: GuidedCampaignLog
): ConditionResult {
  switch (condition.type) {
    case 'multi':
      return multiConditionResult(condition, campaignLog);
    case 'check_supplies':
      return checkSuppliesConditionResult(condition, campaignLog);
    case 'campaign_data':
      return campaignDataConditionResult(condition, campaignLog);
    case 'campaign_log_investigator_count':
      return campaignLogInvestigatorCountConditionResult(condition, campaignLog);
    case 'investigator_campaign_log_cards':
      return investigatorCampaignLogCardsResult(condition, campaignLog);
    case 'campaign_log_cards':
    case 'campaign_log_section_exists':
    case 'campaign_log':
    case 'campaign_log_task':
      return campaignLogConditionResult(condition, campaignLog);
    case 'campaign_log_cards_switch':
      return campaignLogCardsSwitchResult(condition, campaignLog);
    case 'campaign_log_count':
      return campaignLogCountConditionResult(condition, campaignLog);
    case 'math':
      return mathConditionResult(condition, campaignLog);
    case 'has_card':
      return hasCardConditionResult(condition, campaignLog);
    case 'trauma':
      if (condition.investigator === 'each') {
        return basicTraumaConditionResult(condition, campaignLog);
      }
      return killedTraumaConditionResult(condition, campaignLog);
    case 'scenario_data': {
      switch (condition.scenario_data) {
        case 'player_count':
          return numberConditionResult(
            campaignLog.playerCount(),
            condition.options
          );
        case 'resolution':
          return stringConditionResult(
            campaignLog.resolution(),
            condition.options
          );
        case 'has_resolution':
          return binaryConditionResult(
            campaignLog.hasResolution(),
            condition.options
          );
        case 'fixed_investigator_status':
          return fixedInvestigatorStatusConditionResult(condition, campaignLog);
        case 'investigator_status':
          return investigatorStatusConditionResult(condition, campaignLog);
      }
    }
    case 'partner_status':
      return partnerStatusConditionResult(condition, campaignLog);
    case 'location':
      return locationConditionResult(condition, campaignLog);
    case 'scarlet_key':
      return scarletKeyConditionResult(condition, campaignLog);
    case 'scarlet_key_count':
      return scarletKeyCountConditionResult(condition, campaignLog);
  }
}

export function scarletKeyConditionResult(condition: ScarletKeyCondition, campaignLog: GuidedCampaignLog) {
  const key = campaignLog.campaignData.scarlet.keyStatus[condition.scarlet_key];
  switch (condition.status) {
    case 'enemy':
      return binaryConditionResult(
        !!key?.enemy,
        condition.options,
        key?.enemy ? [key.enemy] : []
      );
    case 'investigator':
      return binaryConditionResult(
        !!key?.investigator,
        condition.options,
        key?.investigator ? [key.investigator] : []
      );
  }
}


export function scarletKeyCountConditionResult(condition: ScarletKeyCountCondition, campaignLog: GuidedCampaignLog) {
  const count = condition.status === 'enemy' ?
    sumBy(values(campaignLog.campaignData.scarlet.keyStatus), (status) => status?.enemy ? 1 : 0) :
    sumBy(values(campaignLog.campaignData.scarlet.keyStatus), (status) => status?.investigator && !status?.enemy ? 1 : 0);
  return numberConditionResult(count, condition.options, condition.default_option);
}

export function locationConditionResult(condition: LocationCondition, campaignLog: GuidedCampaignLog): BinaryResult {
  switch (condition.status) {
    case 'visited':
      return binaryConditionResult(
        !!find(campaignLog.campaignData.scarlet.visitedLocations, loc => loc === condition.location),
        condition.options
      );
    case 'current':
      return binaryConditionResult(
        campaignLog.campaignData.scarlet.location === condition.location,
        condition.options
      );
  }
}


export function investigatorChoiceConditionResult(
  condition: InvestigatorChoiceCondition,
  campaignLog: GuidedCampaignLog
): Omit<InvestigatorResult, 'options'> {
  switch (condition.type) {
    case 'has_card':
      return investigatorCardConditionResult(condition, campaignLog);
    case 'trauma':
      return basicTraumaConditionResult(condition, campaignLog);
    case 'investigator':
      return investigatorConditionResult(condition, campaignLog);
    case 'multi': {
      const result = multiConditionResult(condition, campaignLog);
      const investigators = campaignLog.investigatorCodes(false);
      const choices: StringChoices = {};
      forEach(investigators, code => {
        if (result.decision) {
          choices[code] = ['true'];
        }
      });
      return {
        type: 'investigator',
        investigatorChoices: choices,
      };
    }
    case 'campaign_log_cards':
    case 'campaign_log': {
      const result = campaignLogConditionResult(condition, campaignLog);
      const investigators = campaignLog.investigatorCodes(false);
      const investigatorChoices: StringChoices = {};
      forEach(investigators, code => {
        if (condition.type === 'campaign_log') {
          if (result.option) {
            investigatorChoices[code] = [condition.id];
          }
        } else {
          if (result.input) {
            const hasInvestigator = result.input.indexOf(code) !== -1;
            const passes = !!condition.options.find(option => option.boolCondition === hasInvestigator);
            if (passes) {
              investigatorChoices[code] = [condition.id];
            }
          }
        }
      });
      return {
        type: 'investigator',
        investigatorChoices,
      };
    }
  }
}

export default {
  conditionResult,
};
