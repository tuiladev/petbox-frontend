import axios from 'axios'
import { toast } from 'react-toastify'
import { refreshTokenAPI } from '~/redux/user/userService'
import { logoutUserAPI } from '~/redux/user/userSlice'
import { interceptorLoadingElements } from '~/utils/formatters'
import i18n from '~/config/i18nConfig'
import { env } from '~/config/enviroment'

// Use inject technical import redux store in axios
let axiosReduxStore
export const injectStore = (mainStore) => {
  axiosReduxStore = mainStore
}

// Create Axios instance
const authorizedAxiosInstance = axios.create({
  baseURL: `${env.API_ROOT}/${env.API_VERSION}`,
  timeout: 1000 * 60 * 10,
  withCredentials: true
})
export default authorizedAxiosInstance

/**
 * Add a request interceptor
 * interceptorLoadingElements(true) -> show loading -> block spam api call
 */
authorizedAxiosInstance.interceptors.request.use(
  (config) => {
    interceptorLoadingElements(true)
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

/**
 * Handler respone error
 * 1. Handle status codes that are not 2xx (200 -> 299)
 * 2. Handle status code: 401 and refresh token
 * 3. Handle status code: 410 GONE (refresh token)
 */
let refreshTokenPromise = null
authorizedAxiosInstance.interceptors.response.use(
  (response) => {
    interceptorLoadingElements(false)
    return response
  },
  (error) => {
    interceptorLoadingElements(false)

    // Case 1: Handle status code: 401 and refresh token
    // false to not show message (force logout)
    if (error.response?.status === 401) axiosReduxStore.dispatch(logoutUserAPI(false))

    // Case 2: Handle status code: 410 GONE (refresh token)
    const originalRequests = error.config
    if (error.response?.status === 410 && originalRequests) {
      // Check if refreshTokenPromise is null
      if (!refreshTokenPromise) {
        refreshTokenPromise = refreshTokenAPI()
          .then((data) => {
            return data?.accessToken
            // Already in httpOnly (Backend service)
          })
          .catch(() => {
            axiosReduxStore.dispatch(logoutUserAPI(false))
            // Any another error -> logout force !
          })
          .finally(() => {
            refreshTokenPromise = null
            // Reset refreshTokenPromise to null after
          })
      }
      return refreshTokenPromise.then((accessToken) => {
        // Recall error api cause by 410 GONE (needed refreshToKen)
        return authorizedAxiosInstance(originalRequests)
      })
    }

    // Extract error data
    const errorData = error?.response?.data
    const errorMessage = errorData?.errorCode || errorData?.message || error?.message

    // Handle field validation errors
    if (errorData?.fields && Array.isArray(errorData.fields)) {
      errorData.fields.forEach((fieldError) => {
        const fieldErrorMessage = fieldError.errorCode
        toast.error(i18n.t('error:' + fieldErrorMessage))
      })
      return
    }

    // Handle general errors (skip 410)
    if (error?.response?.status !== 410) {
      toast.error(i18n.t('error:' + errorMessage))
    }
    return Promise.reject(error)
  }
)
