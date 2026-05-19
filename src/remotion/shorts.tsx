import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  OffthreadVideo,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type {RovunqCompositionProps} from './types';

const safeFont =
  "'Pretendard', 'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', Arial, sans-serif";

export const RovunqShorts: React.FC<RovunqCompositionProps> = ({videoPath, plan}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const now = frame / fps;
  const src = videoPath ? staticFile(videoPath) : staticFile('placeholder.mp4');

  const activeZoom = plan.zoomEffects.find((effect) => now >= effect.startSec && now <= effect.endSec);
  const zoomScale = activeZoom
    ? interpolate(
        now,
        [activeZoom.startSec, activeZoom.endSec],
        [1, activeZoom.intensity === 'strong' ? 1.12 : activeZoom.intensity === 'medium' ? 1.08 : 1.04],
        {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
      )
    : 1;

  return (
    <AbsoluteFill style={{backgroundColor: '#050608', fontFamily: safeFont, overflow: 'hidden'}}>
      <AbsoluteFill style={{transform: `scale(${zoomScale})`}}>
        <OffthreadVideo src={src} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
      </AbsoluteFill>
      <Vignette />
      {plan.graphics.map((graphic) =>
        now >= graphic.startSec && now <= graphic.endSec ? (
          <TitleCard key={graphic.id} text={graphic.text} startSec={graphic.startSec} />
        ) : null,
      )}
      {plan.subtitles.map((subtitle) =>
        now >= subtitle.startSec && now <= subtitle.endSec ? (
          <Subtitle key={subtitle.id} subtitle={subtitle} startSec={subtitle.startSec} />
        ) : null,
      )}
      {plan.cta.enabled && now >= plan.cta.startSec && now <= plan.cta.endSec ? (
        <Cta text={plan.cta.text} startSec={plan.cta.startSec} />
      ) : null}
    </AbsoluteFill>
  );
};

const Vignette: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        'linear-gradient(180deg, rgba(5,6,8,0.38) 0%, rgba(5,6,8,0.04) 28%, rgba(5,6,8,0.05) 58%, rgba(5,6,8,0.56) 100%)',
      pointerEvents: 'none',
    }}
  />
);

const TitleCard: React.FC<{text: string; startSec: number}> = ({text, startSec}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const local = frame - startSec * fps;
  const enter = spring({frame: local, fps, config: {damping: 14, stiffness: 160}});
  return (
    <div
      style={{
        position: 'absolute',
        top: 122,
        left: 70,
        right: 70,
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [-24, 0])}px)`,
        color: '#f9fafb',
        textShadow: '0 5px 28px rgba(0,0,0,0.72), 0 2px 0 rgba(0,0,0,0.65)',
        fontSize: 74,
        fontWeight: 900,
        lineHeight: 1.04,
        letterSpacing: 0,
      }}
    >
      {text}
    </div>
  );
};

const Subtitle: React.FC<{
  subtitle: RovunqCompositionProps['plan']['subtitles'][number];
  startSec: number;
}> = ({subtitle, startSec}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const local = frame - startSec * fps;
  const enter =
    subtitle.animation === 'pop'
      ? spring({frame: local, fps, config: {damping: 10, stiffness: 190}})
      : interpolate(local, [0, 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const bottom = subtitle.position === 'center' ? 720 : subtitle.position === 'top' ? 260 : 212;
  const isBasic = subtitle.style === 'basic';
  const isEducation = subtitle.style === 'education';
  const isCinematic = subtitle.style === 'cinematic';

  return (
    <div
      style={{
        position: 'absolute',
        left: 72,
        right: 72,
        bottom,
        display: 'flex',
        justifyContent: 'center',
        transform: `scale(${interpolate(enter, [0, 1], [0.92, 1])})`,
        opacity: enter,
      }}
    >
      <div
        style={{
          maxWidth: 936,
          textAlign: 'center',
          color: '#ffffff',
          fontSize: isEducation ? 54 : isBasic ? 60 : isCinematic ? 58 : 70,
          fontWeight: isCinematic ? 700 : 900,
          lineHeight: isCinematic ? 1.22 : 1.12,
          letterSpacing: 0,
          WebkitTextStroke: isEducation || isCinematic ? '0px transparent' : isBasic ? '5px #08090c' : '9px #08090c',
          paintOrder: 'stroke fill',
          textShadow:
            isEducation
              ? '0 4px 22px rgba(0,0,0,0.62)'
              : isCinematic
                ? '0 8px 28px rgba(0,0,0,0.8)'
              : '0 8px 0 rgba(0,0,0,0.5), 0 18px 34px rgba(0,0,0,0.46)',
          background: isEducation ? 'rgba(5,6,8,0.72)' : 'transparent',
          borderRadius: isEducation ? 8 : 0,
          padding: isEducation ? '18px 24px' : 0,
          wordBreak: 'keep-all',
          overflowWrap: 'break-word',
        }}
      >
        {renderEmphasis(subtitle.text, subtitle.emphasisWords)}
      </div>
    </div>
  );
};

const renderEmphasis = (text: string, emphasisWords: string[]) => {
  if (emphasisWords.length === 0) return text;
  const escaped = emphasisWords.map(escapeRegExp).filter(Boolean);
  if (escaped.length === 0) return text;
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
  return text.split(pattern).map((part, index) => {
    const isEmphasis = emphasisWords.some((word) => word.toLowerCase() === part.toLowerCase());
    return isEmphasis ? (
      <span key={`${part}-${index}`} style={{color: '#2ef2c5'}}>
        {part}
      </span>
    ) : (
      part
    );
  });
};

const Cta: React.FC<{text: string; startSec: number}> = ({text, startSec}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame: frame - startSec * fps, fps, config: {damping: 13, stiffness: 150}});
  return (
    <div
      style={{
        position: 'absolute',
        left: 78,
        right: 78,
        bottom: 106,
        display: 'flex',
        justifyContent: 'center',
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [34, 0])}px)`,
      }}
    >
      <div
        style={{
          background: '#f7fbff',
          color: '#08090c',
          borderRadius: 8,
          padding: '28px 46px',
          fontSize: 48,
          lineHeight: 1.12,
          fontWeight: 900,
          boxShadow: '0 20px 60px rgba(0,0,0,0.42)',
          maxWidth: 860,
          textAlign: 'center',
          wordBreak: 'keep-all',
          overflowWrap: 'break-word',
        }}
      >
        {text}
      </div>
    </div>
  );
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
