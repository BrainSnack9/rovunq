import {Captions, FolderOpen, Music2, WandSparkles} from 'lucide-react';
import type {StudioTab} from './types';

export const editorTabs: {id: StudioTab; label: string; icon: typeof FolderOpen}[] = [
  {id: 'media', label: 'Media', icon: FolderOpen},
  {id: 'ai', label: 'AI', icon: WandSparkles},
  {id: 'captions', label: 'Text', icon: Captions},
  {id: 'audio', label: 'Audio', icon: Music2},
];
