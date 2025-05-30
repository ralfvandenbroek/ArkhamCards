import React, { useCallback, useContext } from 'react';
import { View } from 'react-native';
import { find, flatMap } from 'lodash';
import { t } from 'ttag';

import CampaignGuide from '@data/scenario/CampaignGuide';
import { EntrySection } from '@data/scenario/GuidedCampaignLog';
import DeckButton from '@components/deck/controls/DeckButton';
import useTextEditDialog from '@components/core/useTextEditDialog';
import CampaignGuideContext from '../CampaignGuideContext';
import CampaignLogEntryComponent from './CampaignLogEntryComponent';

interface Props {
  sectionId: string;
  campaignGuide: CampaignGuide;
  section: EntrySection;
  title?: string;
  interScenarioId?: string;
}

export default function CampaignLogSectionComponent({ sectionId, campaignGuide, section, title, interScenarioId }: Props) {
  const [dialog, showTextEditDialog] = useTextEditDialog();
  const { campaignState } = useContext(CampaignGuideContext);
  const saveTextEntry = useCallback((text: string) => {
    const entries = campaignState.interScenarioCampaignLogEntries(interScenarioId) || []
    campaignState.setInterScenarioCampaignLogEntries([...entries, text], interScenarioId);
  }, [campaignState, interScenarioId]);
  const editCampaignLogPressed = useCallback(() => {
    showTextEditDialog(t`Record that...`, '', saveTextEntry);
  }, [showTextEditDialog, saveTextEntry]);
  const alternateTitleEntry = sectionId === 'task_progress' ? find(section.entries, entry => entry.type === 'basic') : undefined;
  const alternateTitle = alternateTitleEntry ? campaignGuide.logEntry(sectionId, alternateTitleEntry.id, true) : undefined;
  const alternateText = alternateTitle && alternateTitle.type === 'text' ? alternateTitle.text : undefined;
  return (
    <>
      { flatMap(section.entries, (entry, idx) => (
        (entry.id === '$relationship' || entry.id === '$fatigue' || (sectionId === 'task_progress' && entry.id !== '$count')) ? null : (
          <View key={`${entry.id}_${idx}`}>
            <CampaignLogEntryComponent
              entry={entry}
              sectionId={sectionId}
              campaignGuide={campaignGuide}
              section={section}
              interScenarioId={interScenarioId}
              title={title}
              first={idx === 0}
              last={idx === section.entries.length - 1}
              alternateText={alternateText}
            />
          </View>
        )
      )) }
      { interScenarioId && sectionId === 'campaign_notes' && (
        <DeckButton
          key="edit"
          icon="edit"
          title={t`Record in campaign log`}
          detail={t`Player card entries only`}
          onPress={editCampaignLogPressed}
        />
      ) }
      { dialog }
    </>
  );
}
