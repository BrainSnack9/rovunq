'use client';

import {InspectorPanel} from './components/InspectorPanel';
import {LeftPanel} from './components/LeftPanel';
import {TimelineEditor} from './components/TimelineEditor';
import {PreviewHeader, TimelinePreview} from './components/TimelinePreview';
import {ToolRail} from './components/ToolRail';
import {TopBar} from './components/TopBar';
import {useStudioState} from './hooks/useStudioState';

export function StudioPage() {
  const studio = useStudioState();

  return (
    <main className="min-h-screen bg-ink text-zinc-50">
      <form id="rovunq-editor-form" onSubmit={studio.submit} className="flex min-h-screen flex-col">
        <TopBar
          isBusy={studio.isBusy}
          job={studio.job}
          finalUrl={studio.finalUrl}
          hasTimeline={Boolean(studio.timeline)}
          onUpload={() => studio.fileInputRef.current?.click()}
          onRefresh={studio.refreshJob}
        />
        <div className="grid min-h-0 flex-1 grid-cols-1 border-t border-line lg:grid-cols-[72px_300px_minmax(480px,1fr)_360px]">
          <ToolRail activeTab={studio.activeTab} setActiveTab={studio.setActiveTab} />
          <LeftPanel
            activeTab={studio.activeTab}
            youtubeUrl={studio.youtubeUrl}
            setYoutubeUrl={studio.setYoutubeUrl}
            file={studio.file}
            setFile={studio.setFile}
            audioFile={studio.audioFile}
            setAudioFile={studio.setAudioFile}
            instruction={studio.instruction}
            setInstruction={studio.setInstruction}
            skipOpenai={studio.skipOpenai}
            setSkipOpenai={studio.setSkipOpenai}
            sourceStartMin={studio.sourceStartMin}
            setSourceStartMin={studio.setSourceStartMin}
            sourceDurationMin={studio.sourceDurationMin}
            setSourceDurationMin={studio.setSourceDurationMin}
            sourceUrl={studio.sourceUrl}
            sourceVideoRef={studio.sourceVideoRef}
            setInsertTimeFromSource={studio.setInsertTimeFromSource}
            fileInputRef={studio.fileInputRef}
            audioInputRef={studio.audioInputRef}
            timeline={studio.timeline}
            isBusy={studio.isBusy}
          />
          <section className="flex min-h-0 flex-col bg-[#07080a]">
            <PreviewHeader job={studio.job} timeline={studio.timeline} progress={studio.progress} />
            <div className="flex min-h-0 flex-1 items-center justify-center p-4">
              <TimelinePreview
                sourceUrl={studio.sourceUrl}
                finalUrl={studio.finalUrl}
                timeline={studio.timeline}
                selectedClipId={studio.selectedClipId}
                onSelectClip={studio.setSelectedClipId}
                job={studio.job}
              />
            </div>
            <TimelineEditor
              timeline={studio.timeline}
              duration={studio.duration}
              selectedClipId={studio.selectedClipId}
              onSelectClip={studio.setSelectedClipId}
              audioFileName={studio.audioFile?.name}
            />
          </section>
          <InspectorPanel
            job={studio.job}
            error={studio.error}
            progress={studio.progress}
            isBusy={studio.isBusy}
            timeline={studio.timeline}
            selectedClip={studio.selectedClip}
            selectedVideoClip={studio.selectedVideoClip}
            selectedCaption={studio.selectedCaption}
            subtitleDraft={studio.subtitleDraft}
            setSubtitleDraft={studio.setSubtitleDraft}
            insertStart={studio.insertStart}
            setInsertStart={studio.setInsertStart}
            insertEnd={studio.insertEnd}
            setInsertEnd={studio.setInsertEnd}
            insertSubtitle={studio.insertSubtitle}
            setInsertSubtitle={studio.setInsertSubtitle}
            insertManualCut={studio.insertManualCut}
            applyManualEdit={studio.applyManualEdit}
          />
        </div>
      </form>
    </main>
  );
}
