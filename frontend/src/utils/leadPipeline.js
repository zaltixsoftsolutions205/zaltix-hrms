export const PIPELINE_STAGES = ['lead', 'visit', 'registration', 'demo', 'data-update', 'feedback', 'converted', 'closed-won', 'closed-lost',];

export const formatPipelineStage = (stage) => {
    if (!stage) return 'Lead';
    return stage.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

export const pipelineBadgeClass = (stage) => {
    if (stage === 'converted' || stage === 'closed-won') return 'bg-green-100 text-green-700';
    if (stage === 'closed-lost') return 'bg-red-100 text-red-600';
    return 'bg-violet-100 text-violet-700';
};