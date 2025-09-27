import type { OdFileObject } from '../../types'

import { FC, useEffect, useState, useRef } from 'react' // 👈 ADDED useRef
import { useRouter } from 'next/router'

import axios from 'axios'
import toast from 'react-hot-toast'
import Plyr from 'plyr-react'
import { useAsync } from 'react-async-hook'
import { useClipboard } from 'use-clipboard-copy'

import { getBaseUrl } from '../../utils/getBaseUrl'
import { getExtension } from '../../utils/getFileIcon'
import { getStoredToken } from '../../utils/protectedRouteHandler'

import { DownloadButton } from '../DownloadBtnGtoup'
import { DownloadBtnContainer, PreviewContainer } from './Containers'
import FourOhFour from '../FourOhFour'
import Loading from '../Loading'
import CustomEmbedLinkMenu from '../CustomEmbedLinkMenu'

import 'plyr-react/plyr.css'

// Define the type for the Plyr ref to access its API
type PlyrInstance = { plyr: { currentTime: number } }

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
  // -------------------------------------------------------------
  // MODIFICATION: Setup ref for Plyr and skip logic
  // -------------------------------------------------------------
  const playerRef = useRef<PlyrInstance | null>(null) // Ref to access the underlying Plyr instance

  const handleSkip = (seconds: number) => {
    if (playerRef.current && playerRef.current.plyr) {
      playerRef.current.plyr.currentTime += seconds
    }
  }
  // -------------------------------------------------------------
  // END MODIFICATION
  // -------------------------------------------------------------

  useEffect(() => {
    // Really really hacky way to inject subtitles as file blobs into the video element
    axios
      .get(subtitle, { responseType: 'blob' })
      .then(resp => {
        const track = document.querySelector('track')
        track?.setAttribute('src', URL.createObjectURL(resp.data))
      })
      .catch(() => {
        console.log('Could not load subtitle.')
      })

    if (isFlv) {
      const loadFlv = () => {
        // Really hacky way to get the exposed video element from Plyr
        const video = document.getElementById('plyr')
        const flv = mpegts.createPlayer({ url: videoUrl, type: 'flv' })
        flv.attachMediaElement(video)
        flv.load()
      }
      loadFlv()
    }
  }, [videoUrl, isFlv, mpegts, subtitle])

  // Common plyr configs, including the video source and plyr options
  const plyrSource = {
    type: 'video',
    title: videoName,
    poster: thumbnail,
    tracks: [{ kind: 'captions', label: videoName, src: '', default: true }],
  }
  const plyrOptions: Plyr.Options = {
    ratio: `${width ?? 16}:${height ?? 9}`,
    fullscreen: { iosNative: true },
    // -------------------------------------------------------------
    // MODIFICATION: Add 'fast-forward' and 'rewind' to the control bar
    // -------------------------------------------------------------
    controls: [
      //'play-large',   // Large center play button
      //'restart',
      'rewind',       // Control bar skip backward
      'play',
      'fast-forward', // Control bar skip forward
      'progress',
      'current-time',
      'duration',
      'mute',
      'volume',
      'captions',
      'settings',     // Automatically includes Audio Track control if available
      //'pip',          // Picture-in-Picture
      'fullscreen',
    ],
    // -------------------------------------------------------------
    // END MODIFICATION
    // -------------------------------------------------------------
  }
  if (!isFlv) {
    // If the video is not in flv format, we can use the native plyr and add sources directly with the video URL
    plyrSource['sources'] = [{ src: videoUrl }]
  }

  // -------------------------------------------------------------
  // MODIFICATION: Wrap Plyr with Skip Overlays for on-screen skip
  // -------------------------------------------------------------
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Skip Backward Overlay (Left Half) - Double-click/tap skips back 10s */}
      <div
        className="absolute top-0 left-0 w-1/2 h-full z-10 cursor-pointer"
        onDoubleClick={() => handleSkip(-10)}
        aria-label="Skip backward 10 seconds"
        title="Double-click to skip backward 10 seconds"
      />

      {/* Skip Forward Overlay (Right Half) - Double-click/tap skips forward 10s */}
      <div
        className="absolute top-0 right-0 w-1/2 h-full z-10 cursor-pointer"
        onDoubleClick={() => handleSkip(10)}
        aria-label="Skip forward 10 seconds"
        title="Double-click to skip forward 10 seconds"
      />

      {/* The Plyr player component, linked to playerRef */}
      <Plyr ref={playerRef} id="plyr" source={plyrSource as Plyr.SourceInfo} options={plyrOptions} />
    </div>
  )
  // -------------------------------------------------------------
  // END MODIFICATION
  // -------------------------------------------------------------
}

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
