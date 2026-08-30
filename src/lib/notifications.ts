export const createNotification = async (input: {
  kind: string;
  title: string;
  description: string;
}) => {
  // Placeholder implementation
  console.log("Notification:", input);
  return { id: Math.random().toString(36).substr(2, 9) };
};

export const getNotifications = async () => {
  // Placeholder implementation
  return [];
};