import type { OdFileObject } from '../../types'

import { FC, useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'

import axios from 'axios'
import toast from 'react-hot-toast'
import { useAsync } from 'react-async-hook'
import { useClipboard } from 'use-clipboard-copy'

// ⚠️ NEW IMPORTS for Video.js wrapper (video-react)
import { Player, ControlBar, BigPlayButton, PlaybackRateMenuButton, VolumeMenuButton } from 'video-react'
import 'video-react/dist/video-react.css' // Import CSS for the new player

import { getBaseUrl } from '../../utils/getBaseUrl'
import { getExtension } from '../../utils/getFileIcon'
import { getStoredToken } from '../../utils/protectedRouteHandler'

import { DownloadButton } from '../DownloadBtnGtoup'
import { DownloadBtnContainer, PreviewContainer } from './Containers'
import FourOhFour from '../FourOhFour'
import Loading from '../Loading'
import CustomEmbedLinkMenu from '../CustomEmbedLinkMenu'

// -------------------------------------------------------------
// MODIFICATION START: Replaced Plyr with Video.js (video-react)
// -------------------------------------------------------------

const VideoPlayer: FC<{
  videoName: string
  videoUrl: string
  width?: number
  height?: number
  thumbnail: string
  subtitle: string
  isFlv: boolean
  mpegts: any
}> = ({ videoName, videoUrl, width, height, thumbnail, subtitle, isFlv, mpegts }) => {
  // 1. Use a Ref to access the underlying player instance/DOM node
  // FIX: Using 'any' to resolve TypeScript error for the component instance.
  const playerRef = useRef<any>(null)

  useEffect(() => {
    // Check if the player is ready and get the internal <video> element
    // The underlying HTMLVideoElement is usually found at instance.video.video
    const videoElement = playerRef.current?.video.video

    // -----------------------------------------------------------------
    // 2. Subtitle Injection Logic (Modified to use Ref)
    // -----------------------------------------------------------------
    if (videoElement) {
      axios
        .get(subtitle, { responseType: 'blob' })
        .then(resp => {
          // Query for the specific track element within the underlying video element
          const track = videoElement.querySelector('track')
          if (track) {
            track.setAttribute('src', URL.createObjectURL(resp.data))
          }
        })
        .catch(() => {
          console.log('Could not load subtitle.')
        })
    }

    // -----------------------------------------------------------------
    // 3. FLV/mpegts.js Logic (Modified to use Ref)
    // -----------------------------------------------------------------
    if (isFlv && mpegts && videoElement) {
      const loadFlv = () => {
        // Use the videoElement obtained from the Ref
        const flv = mpegts.createPlayer({ url: videoUrl, type: 'flv' })
        flv.attachMediaElement(videoElement)
        flv.load()
      }
      loadFlv()
    }
  }, [videoUrl, isFlv, mpegts, subtitle])

  // Note: video-react handles aspect ratio through a prop/CSS
  const aspectRatio = `${width ?? 16}:${height ?? 9}`

  // For FLV files, set the source to an empty string; mpegts.js handles injection.
  const sourceUrl = isFlv ? '' : videoUrl

  return (
    // 'video-react' Player component replaces 'Plyr'
    <Player
      ref={playerRef} // Attach ref for custom logic
      playsInline
      poster={thumbnail}
      src={sourceUrl}
      fluid={true} // Use 100% width of the container
      aspectRatio={aspectRatio}
      // ⚠️ CRITICAL FIX: Cast to any to bypass the TypeScript error about 'children' prop
      {...({} as any)}
    >
      {/* 4. Subtitle Track: It must be here for the useEffect to find it */}
      {/* The `src` is empty and will be filled by the useEffect hook with the blob URL. */}
      <track kind="captions" label={videoName} src="" default={true} />

      {/* 5. Custom Control Bar. This is where controls are configured in video-react. */}
      <BigPlayButton position="center" />
      <ControlBar>
        {/* PlaybackRateMenuButton allows speed control, similar to one of the custom Plyr controls */}
        <VolumeMenuButton vertical />
        <PlaybackRateMenuButton rates={[2, 1.5, 1.25, 1, 0.75, 0.5]} />
      </ControlBar>

      {/* For true multi-audio support, further configuration (HLS/DASH manifest + plugin) 
          would be needed outside of this file's current scope. */}
    </Player>
  )
}

// -------------------------------------------------------------
// MODIFICATION END
// -------------------------------------------------------------

const VideoPreview: FC<{ file: OdFileObject }> = ({ file }) => {
  const { asPath } = useRouter()
  const hashedToken = getStoredToken(asPath)
  const clipboard = useClipboard()

  const [menuOpen, setMenuOpen] = useState(false)

  // OneDrive generates thumbnails for its video files, we pick the thumbnail with the highest resolution
  const thumbnail = `/api/thumbnail?path=${asPath}&size=large${hashedToken ? `&odpt=${hashedToken}` : ''}`

  // We assume subtitle files are beside the video with the same name, only webvtt '.vtt' files are supported
  const vtt = `${asPath.substring(0, asPath.lastIndexOf('.'))}.vtt`
  const subtitle = `/api/raw?path=${vtt}${hashedToken ? `&odpt=${hashedToken}` : ''}`

  // We also format the raw video file for the in-browser player as well as all other players
  const videoUrl = `/api/raw?path=${asPath}${hashedToken ? `&odpt=${hashedToken}` : ''}`

  const isFlv = getExtension(file.name) === 'flv'
  const {
    loading,
    error,
    result: mpegts,
  } = useAsync(async () => {
    if (isFlv) {
      return (await import('mpegts.js')).default
    }
  }, [isFlv])

  return (
    <>
      <CustomEmbedLinkMenu path={asPath} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
      <PreviewContainer>
        {error ? (
          <FourOhFour errorMsg={error.message} />
        ) : loading && isFlv ? (
          <Loading loadingText={'Loading FLV extension...'} />
        ) : (
          <VideoPlayer
            videoName={file.name}
            videoUrl={videoUrl}
            width={file.video?.width}
            height={file.video?.height}
            thumbnail={thumbnail}
            subtitle={subtitle}
            isFlv={isFlv}
            mpegts={mpegts}
          />
        )}
      </PreviewContainer>

      <DownloadBtnContainer>
        <div className="flex flex-wrap justify-center gap-2">
          <DownloadButton
            onClickCallback={() => window.open(videoUrl)}
            btnColor="blue"
            btnText={'Download'}
            btnIcon="file-download"
          />
          <DownloadButton
            onClickCallback={() => {
              clipboard.copy(`${getBaseUrl()}/api/raw?path=${asPath}${hashedToken ? `&odpt=${hashedToken}` : ''}`)
              toast.success('Copied direct link to clipboard.')
            }}
            btnColor="pink"
            btnText={'Copy direct link'}
            btnIcon="copy"
          />
        </div>
      </DownloadBtnContainer>
    </>
  )
}

export default VideoPreview
