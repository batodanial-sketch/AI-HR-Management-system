export const fetchData = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch data: ${response.statusText}`);
  }
  return response.json();
};

export const postData = async <T>(url: string, data: unknown): Promise<T> => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(`Failed to post data: ${response.statusText}`);
  }
  return response.json();
};