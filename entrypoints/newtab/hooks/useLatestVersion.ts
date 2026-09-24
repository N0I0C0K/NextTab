import { useState, useEffect, useCallback } from 'react'

interface GitHubRelease {
  tag_name: string
  name: string
}

interface CachedVersion {
  version: string
  timestamp: number
}

const CACHE_KEY = 'latest_version_cache'
const CACHE_DURATION = 60 * 60 * 1000 // 1 hour in milliseconds

export const useLatestVersion = (repositoryUrl: string) => {
  const [latestVersion, setLatestVersion] = useState('')
  const [isChecking, setIsChecking] = useState(false)
  const [checkError, setCheckError] = useState(false)

  const fetchLatestVersion = useCallback(async () => {
    // Check if URL contains github.com
    if (!repositoryUrl.includes('github.com')) {
      console.warn('Repository URL is not a GitHub URL, skipping version check')
      setCheckError(true)
      return
    }

    // Check cache first
    try {
      const cached = await chrome.storage.local.get(CACHE_KEY)
      if (cached[CACHE_KEY]) {
        const cachedData: CachedVersion = cached[CACHE_KEY]
        const now = Date.now()
        if (now - cachedData.timestamp < CACHE_DURATION) {
          setLatestVersion(cachedData.version)
          return
        }
      }
    } catch (error) {
      console.error('Failed to read cache:', error)
    }

    setIsChecking(true)
    setCheckError(false)
    try {
      // Extract owner and repo from repository URL, handling .git suffix
      const repoMatch = repositoryUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/|$)/)
      if (!repoMatch) {
        throw new Error('Invalid repository URL')
      }
      const [, owner, repo] = repoMatch
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`)
      if (!response.ok) {
        throw new Error('Failed to fetch')
      }
      const data: GitHubRelease = await response.json()
      // Use name if available, otherwise use tag_name
      const versionText = data.name || data.tag_name
      setLatestVersion(versionText)

      // Cache the result
      try {
        await chrome.storage.local.set({
          [CACHE_KEY]: {
            version: versionText,
            timestamp: Date.now(),
          } as CachedVersion,
        })
      } catch (error) {
        console.error('Failed to cache version:', error)
      }
    } catch (error) {
      console.error('Failed to fetch latest version:', error)
      setCheckError(true)
    } finally {
      setIsChecking(false)
    }
  }, [repositoryUrl])

  useEffect(() => {
    fetchLatestVersion()
  }, [fetchLatestVersion])

  return { latestVersion, isChecking, checkError, refetch: fetchLatestVersion }
}
