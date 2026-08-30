export const scheduleJob = async (job: {
  name: string;
  schedule: string;
  handler: () => Promise<void>;
}) => {
  // Placeholder implementation
  console.log(`Scheduled job: ${job.name} at ${job.schedule}`);
  return { id: crypto.randomUUID() };
};

export const getScheduledJobs = async () => {
  // Placeholder implementation
  return [];
};