export const fetchApi = async <T>(endpoint: string, options: RequestInit = {}): Promise<T> => {
  const response = await fetch(`/api${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
};

export const postApi = async <T>(endpoint: string, data: unknown): Promise<T> => {
  return fetchApi<T>(endpoint, {
    method: "POST",
    body: JSON.stringify(data),
  });
};

export const putApi = async <T>(endpoint: string, data: unknown): Promise<T> => {
  return fetchApi<T>(endpoint, {
    method: "PUT",
    body: JSON.stringify(data),
  });
};

export const deleteApi = async <T>(endpoint: string): Promise<T> => {
  return fetchApi<T>(endpoint, {
    method: "DELETE",
  });
};