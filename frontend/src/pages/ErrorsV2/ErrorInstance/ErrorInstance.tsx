import { useApolloClient } from '@apollo/client'
import { Avatar } from '@components/Avatar/Avatar'
import {
	GetErrorInstanceDocument,
	useGetErrorInstanceQuery,
} from '@graph/hooks'
import { GetErrorGroupQuery, GetErrorObjectQuery } from '@graph/operations'
import type { ErrorInstance as ErrorInstanceType } from '@graph/schemas'
import { Box, Button, Column, Heading, IconPlay, Text } from '@highlight-run/ui'
import { useProjectId } from '@hooks/useProjectId'
import ErrorStackTrace from '@pages/ErrorsV2/ErrorStackTrace/ErrorStackTrace'
import { EmptySessionsSearchParams } from '@pages/Sessions/EmptySessionsSearchParams'
import { useSearchContext } from '@pages/Sessions/SearchContext/SearchContext'
import {
	getDisplayNameAndField,
	getIdentifiedUserProfileImage,
	getUserProperties,
} from '@pages/Sessions/SessionsFeedV2/components/MinimalSessionCard/utils/utils'
import analytics from '@util/analytics'
import { loadSession } from '@util/preload'
import { useParams } from '@util/react-router/useParams'
import React, { useEffect } from 'react'
import { FiExternalLink } from 'react-icons/fi'
import { useHistory } from 'react-router-dom'

type Props = React.PropsWithChildren & {
	errorGroup: GetErrorGroupQuery['error_group']
}

const ErrorInstance: React.FC<Props> = ({ errorGroup }) => {
	const { error_object_id, error_secure_id } = useParams<{
		error_secure_id: string
		error_object_id: string
	}>()
	const { projectId } = useProjectId()
	const history = useHistory()
	const client = useApolloClient()

	const { data } = useGetErrorInstanceQuery({
		variables: {
			error_group_secure_id: String(errorGroup?.secure_id),
			error_object_id,
		},
		onCompleted: (data) => {
			const previousErrorObjectId = data?.error_instance?.previous_id
			const nextErrorObjectId = data?.error_instance?.next_id

			// Prefetch the next/previous error objects so they are in the cache.
			// Using client directly because the lazy query had issues with canceling
			// multiple requests: https://github.com/apollographql/apollo-client/issues/9755
			if (previousErrorObjectId) {
				client.query({
					query: GetErrorInstanceDocument,
					variables: {
						error_group_secure_id: String(errorGroup?.secure_id),
						error_object_id: previousErrorObjectId,
					},
				})
			}

			if (nextErrorObjectId) {
				client.query({
					query: GetErrorInstanceDocument,
					variables: {
						error_group_secure_id: String(errorGroup?.secure_id),
						error_object_id: nextErrorObjectId,
					},
				})
			}

			// Prefetch session data.
			if (data?.error_instance?.error_object?.session) {
				loadSession(data.error_instance.error_object.session.secure_id)
			}
		},
	})

	useEffect(() => analytics.page(), [])

	const errorInstance = data?.error_instance

	if (!errorInstance || !errorInstance?.error_object) {
		return null
	}

	const errorObject = errorInstance.error_object

	return (
		<Box id="error-instance-container">
			<Box my="28" display="flex" justifyContent="space-between">
				<Box display="flex" flexDirection="column" gap="16">
					<Heading level="h4">Error Instance</Heading>
				</Box>

				<Box>
					<Box display="flex" gap="8" alignItems="center">
						<Button
							onClick={() => {
								history.push({
									pathname: `/${projectId}/errors/${error_secure_id}/instances/${errorInstance.previous_id}`,
									search: window.location.search,
								})
							}}
							disabled={Number(errorInstance.previous_id) === 0}
							kind="secondary"
							emphasis="low"
						>
							Older
						</Button>
						<Box borderRight="neutral" style={{ height: 18 }} />
						<Button
							onClick={() => {
								history.push({
									pathname: `/${projectId}/errors/${error_secure_id}/instances/${errorInstance.next_id}`,
									search: window.location.search,
								})
							}}
							disabled={Number(errorInstance.next_id) === 0}
							kind="secondary"
							emphasis="low"
						>
							Newer
						</Button>
						<Button
							kind="secondary"
							emphasis="high"
							onClick={() =>
								history.push(
									`/${projectId}/sessions/${errorObject.session?.secure_id}`,
								)
							}
							iconLeft={<IconPlay />}
						>
							Show Session
						</Button>
					</Box>
				</Box>
			</Box>

			<Box
				display="flex"
				flexDirection={{ desktop: 'row', mobile: 'column' }}
				mb="40"
				gap="40"
			>
				<div style={{ flexBasis: 0, flexGrow: 1 }}>
					<Metadata errorObject={errorObject} />
				</div>

				<div style={{ flexBasis: 0, flexGrow: 1 }}>
					<Box display="flex">
						<User errorObject={errorObject} />
					</Box>
				</div>
			</Box>

			<Text size="large" weight="bold">
				Stack trace
			</Text>
			<Box bt="neutral" mt="12" pt="16">
				<ErrorStackTrace
					errorObject={
						errorObject as ErrorInstanceType['error_object']
					}
				/>
			</Box>
		</Box>
	)
}

const Metadata: React.FC<{
	errorObject?: GetErrorObjectQuery['error_object']
}> = ({ errorObject }) => {
	if (!errorObject) {
		return null
	}

	// TODO: Be smarter about how we pull these.
	const metadata = [
		{ key: 'environment', label: errorObject?.environment },
		{ key: 'browser', label: errorObject?.browser },
		{ key: 'os', label: errorObject?.os },
		{ key: 'url', label: errorObject?.url },
		{ key: 'created_at', label: errorObject?.created_at },
	].filter((t) => Boolean(t.label))

	return (
		<Box>
			<Box bb="neutral" pb="20" my="12">
				<Text weight="bold" size="large">
					Instance metadata
				</Text>
			</Box>

			<Box>
				<Column.Container gap="16">
					<Column span="4">
						{metadata.map((meta) => (
							<Box py="10" key={meta.key}>
								<Text
									color="neutral500"
									transform="capitalize"
									align="left"
								>
									{meta.key.replace('_', ' ')}
								</Text>
							</Box>
						))}
					</Column>
					<Column span="8">
						{metadata.map((meta) => (
							<Box py="10" key={meta.key}>
								<Text align="left" lines="1">
									{meta.label}
								</Text>
							</Box>
						))}
					</Column>
				</Column.Container>
			</Box>
		</Box>
	)
}

const User: React.FC<{
	errorObject?: GetErrorObjectQuery['error_object']
}> = ({ errorObject }) => {
	const history = useHistory()
	const { projectId } = useProjectId()
	const { setSearchParams } = useSearchContext()

	if (!errorObject?.session) {
		return null
	}

	const { session } = errorObject
	const userProperties = getUserProperties(session)
	const [displayName, field] = getDisplayNameAndField(session)
	const avatarImage = getIdentifiedUserProfileImage(session)
	const userDisplayPropertyKeys = Object.keys(userProperties).filter(
		(k) => k !== 'avatar',
	)
	const location = [session?.city, session?.state, session?.country]
		.filter(Boolean)
		.join(', ')

	return (
		<Box width="full">
			<Box pb="20" mt="12">
				<Text weight="bold" size="large">
					User details
				</Text>
			</Box>
			<Box border="neutral" borderRadius="6">
				<Box
					bb="neutral"
					py="8"
					px="12"
					alignItems="center"
					display="flex"
					justifyContent="space-between"
				>
					<Box alignItems="center" display="flex" gap="8">
						<Avatar
							seed={displayName}
							style={{ height: 28, width: 28 }}
							customImage={avatarImage}
						/>
						<Text lines="1">{displayName}</Text>
					</Box>

					<Box flexShrink={0} display="flex">
						<Button
							kind="secondary"
							emphasis="high"
							iconRight={<FiExternalLink />}
							onClick={() => {
								// Logic taken from Metadata box. There may be a cleaner way.
								const searchParams = {
									...EmptySessionsSearchParams,
								}

								if (session.identifier && field !== null) {
									searchParams.user_properties = [
										{
											id: '0',
											name: field,
											value: displayName,
										},
									]
								} else if (session?.fingerprint) {
									searchParams.device_id = String(
										session.fingerprint,
									)
								}

								history.push(`/${projectId}/sessions`)
								setSearchParams(searchParams)
							}}
						>
							All sessions for this user
						</Button>
					</Box>
				</Box>

				<Box py="8" px="12">
					<Box>
						<Column.Container gap="16">
							<Column span="4">
								{userDisplayPropertyKeys.map((key) => (
									<Box py="10" key={key}>
										<Text
											color="neutral500"
											align="left"
											transform="capitalize"
										>
											{key}
										</Text>
									</Box>
								))}

								<Box py="10">
									<Text color="neutral500" align="left">
										Location
									</Text>
								</Box>
							</Column>
							<Column span="8">
								{userDisplayPropertyKeys.map((key) => (
									<Box py="10" key={key}>
										<Text>{userProperties[key]}</Text>
									</Box>
								))}

								<Box py="10">
									<Text>{location}</Text>
								</Box>
							</Column>
						</Column.Container>
					</Box>
				</Box>
			</Box>
		</Box>
	)
}

export default ErrorInstance