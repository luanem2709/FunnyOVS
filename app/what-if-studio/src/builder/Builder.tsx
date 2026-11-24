// Hai composition cho Remotion: "Builder" (phim) va "BuilderBoard" (moi canh mot khung hinh de duyet).
// Du lieu tap phim truyen vao qua --props (file project.json).
import React, { useMemo } from 'react';
import { Episode, Board } from '../engine';
import { buildEpisode, totalFrames } from './project';
import type { Project } from './types';
import { SAMPLE } from './sample';

export type BuilderProps = { project: Project };

export const BuilderMain: React.FC<BuilderProps> = ({ project }) => {
  const ep = useMemo(() => buildEpisode(project ?? SAMPLE), [project]);
  return <Episode timeline={ep.timeline} shots={ep.shots} looks={ep.looks} />;
};

export const BuilderBoard: React.FC<BuilderProps> = ({ project }) => {
  const ep = useMemo(() => buildEpisode(project ?? SAMPLE), [project]);
  return <Board timeline={ep.timeline} shots={ep.shots} />;
};

export const builderDefaults: BuilderProps = { project: SAMPLE };
export const builderMeta = ({ props }: { props: BuilderProps }) => ({ durationInFrames: Math.max(1, totalFrames(props.project ?? SAMPLE)) });
export const boardMeta = ({ props }: { props: BuilderProps }) => ({ durationInFrames: Math.max(1, (props.project ?? SAMPLE).shots.length) });
