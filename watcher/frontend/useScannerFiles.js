/**
 * HOOK: useScannerFiles
 * 
 * Fetch files with automatic scanner filter
 * 
 * Usage:
 *   const { files, loading, error, refetch } = useScannerFiles({
 *     department: user.department,
 *     limit: 20
 *   });
 */

import { useState, useEffect, useCallback } from 'react';

const API_BASE = '/api/v1';

export const useScannerFiles = (options = {}) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    totalPages: 0,
    currentPage: 1,
    total: 0
  });

  const fetchFiles = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token') || 
                    sessionStorage.getItem('token');

      if (!token) {
        throw new Error('No authentication token found');
      }

      // Build query params
      const queryParams = new URLSearchParams({
        page: params.page || 1,
        limit: params.limit || 20,
        sortBy: params.sortBy || 'createdAt',
        sortOrder: params.sortOrder || 'desc',
        ...options
      });

      // Optional: filter only scanner files
      if (options.onlyScanner) {
        queryParams.append('isScanned', 'true');
      }

      const res = await fetch(`${API_BASE}/files?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.message || 'Failed to fetch files');
      }

      setFiles(json.data.files);
      setPagination({
        totalPages: json.data.totalPages,
        currentPage: json.data.currentPage,
        total: json.data.total
      });

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [options]);

  // Initial fetch
  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  return {
    files,
    loading,
    error,
    refetch: () => fetchFiles(),
    pagination
  };
};

/**
 * Hook for scanner-specific files only
 */
export const useScannerFilesOnly = (dept = null) => {
  return useScannerFiles({
    onlyScanner: true,
    ...(dept && { department: dept })
  });
};

export default useScannerFiles;
