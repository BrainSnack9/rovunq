import React from 'react';
import {Composition} from 'remotion';
import {RovunqShorts} from './shorts';
import type {RovunqCompositionProps} from './types';

export const RovunqRoot: React.FC = () => {
  return (
    <Composition
      id="RovunqShorts"
      component={RovunqShorts}
      durationInFrames={1800}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        videoPath: '',
        plan: {
          output: {
            format: 'mp4',
            aspectRatio: '9:16',
            width: 1080,
            height: 1920,
            fps: 30,
            targetDurationSec: 60,
          },
          source: {originalDurationSec: 60, language: 'ko'},
          cuts: [
            {
              id: 'cut_001',
              sourceStartSec: 0,
              sourceEndSec: 60,
              outputStartSec: 0,
              outputEndSec: 60,
              reason: 'fallback',
              keepAudio: true,
              speed: 1,
            },
          ],
          silenceRemoval: {enabled: true, thresholdDb: -35, minSilenceMs: 500},
          transitions: [],
          zoomEffects: [],
          subtitles: [],
          graphics: [],
          cta: {enabled: false, startSec: 55, endSec: 60, text: '', style: 'clean_bold', timebase: 'output'},
          finalDurationSec: 60,
        },
      }}
      calculateMetadata={({props}) => {
        const fps = props.plan.output.fps;
        return {
          durationInFrames: Math.max(1, Math.ceil(props.plan.finalDurationSec * fps)),
          fps,
          width: props.plan.output.width,
          height: props.plan.output.height,
        };
      }}
    />
  );
};
