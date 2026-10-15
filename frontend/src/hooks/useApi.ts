import { useCallback, useEffect, useState } from 'react';
import { apiRequest, describeError } from '../api/client';

interface ResourceState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/**
 * Loads a GET resource. Passing a null path skips the request. Stale responses are ignored, so
 * fast filter changes cannot show results from an earlier query.
 */
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<ResourceState<T>>({ data: null, error: null, loading: path !== null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (path === null) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    let active = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    apiRequest<T>(path)
      .then((data) => {
        if (active) setState({ data, error: null, loading: false });
      })
      .catch((err: unknown) => {
        if (active) setState({ data: null, error: describeError(err), loading: false });
      });
    return () => {
      active = false;
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload, setData: (data: T) => setState({ data, error: null, loading: false }) };
}
