import { supabase } from "./supabaseClient.ts"
import { bucket, password } from "./data.ts"
import { ACCEPTED_MIME_TYPES, ACCEPTED_EXTENSIONS, MAX_IMAGE_MB, MAX_IMAGE_BYTES } from "../../../shared/constants/images.ts"

const BUCKET = bucket

export const REQUEST_PASSWORD = password
export const LIST_LIMIT = 100

export function generateUUID() {
	return crypto.randomUUID()
}

export function slugify(title: string) {
	return title
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, "-")
}

export function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function isTransientError(error: any) {
	const message = String(error?.message ?? "").toLowerCase()
	const code = String(error?.code ?? "").toUpperCase()
	const status = Number(error?.status ?? 0)

	if ([502, 503, 504].includes(status)) return true

	if (
		message.includes("timeout") ||
		message.includes("timed out") ||
		message.includes("network") ||
		message.includes("connection")
	) {
		return true
	}

	if (["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"].includes(code)) {
		return true
	}

	return false
}

export function validateImageFile(file: File) {
	const ext = `.${file.name.split(".").pop() ?? ""}`.toLowerCase()

	if (!ACCEPTED_EXTENSIONS.includes(ext)) {
		throw new Error(`INVALID_IMAGE_MIME:${file.name}`)
	}

	if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
		throw new Error(`INVALID_IMAGE_MIME:${file.name}`)
	}

	if (file.size > MAX_IMAGE_BYTES) {
		throw new Error(`IMAGE_TOO_LARGE:${file.name}`)
	}
}

type UploadOptions = {
	upsert?: boolean
	mapErrors?: boolean
}

export async function uploadFile(
	path: string,
	file: File,
	options: UploadOptions = {}
) {
	const { upsert = false, mapErrors = true } = options

	const { error } = await supabase
		.storage
		.from(BUCKET)
		.upload(path, file, { upsert })

	if (error) {
		if (mapErrors) {
			const message = String(error.message ?? "").toLowerCase()

			if (message.includes("mime") || message.includes("content type")) {
				throw new Error(`INVALID_IMAGE_MIME:${file.name}`)
			}

			if (message.includes("size") && (message.includes("limit") || message.includes("exceed"))) {
				throw new Error(`IMAGE_TOO_LARGE:${file.name}`)
			}
		}

		throw error
	}
}

export async function deleteFiles(paths: string[]) {
	if (paths.length === 0) return

	await supabase
		.storage
		.from(BUCKET)
		.remove(paths)
}

export async function listAllPostFiles(postId: string) {
	const allFiles: Array<{ name: string }> = []
	let offset = 0

	while (true) {
		const { data, error } = await supabase
			.storage
			.from(BUCKET)
			.list(postId, { limit: LIST_LIMIT, offset })

		if (error) throw error

		if (!data || data.length === 0) break

		allFiles.push(...data)

		if (data.length < LIST_LIMIT) break

		offset += LIST_LIMIT
	}

	return allFiles
}

export async function uploadBanner(
	postId: string,
	banner: File,
	options?: UploadOptions
) {
	validateImageFile(banner)

	const ext = banner.name.split(".").pop()

	if (!ext) throw new Error("INVALID_BANNER_EXTENSION")

	const version = Date.now()
	const path = `${postId}/banner_${version}.${ext}`

	await uploadFile(path, banner, options)

	return path
}

export async function uploadContentImages(
	postId: string,
	files: File[],
	options?: UploadOptions
) {
	const paths: Record<string, string> = {}
	const usedNames = new Set<string>()

	for (const file of files) {

		validateImageFile(file)

		const ext = file.name.split(".").pop()

		if (!ext) throw new Error("INVALID_IMAGE_EXTENSION")

		const shortName = file.name.split(".")[0]

		if (usedNames.has(shortName)) {
			throw new Error("DUPLICATE_IMAGE_NAME")
		}

		const path = `${postId}/${shortName}.${ext}`

		await uploadFile(path, file, options)

		paths[shortName] = path
		usedNames.add(shortName)
	}

	return paths
}

export function replaceImagePaths(
	markdown: string,
	paths: Record<string, string>
) {
	let result = markdown

	for (const [name, path] of Object.entries(paths)) {

		const safeName = escapeRegExp(name)
		const regex = new RegExp(`\\(${safeName}\\)`, "g")

		result = result.replace(regex, `(${path})`)
	}

	return result
}

export async function insertPostWithRetry(postData: any, retries = 3) {

	for (let i = 0; i < retries; i++) {

		const { error } = await supabase
			.from("posts")
			.insert(postData)

		if (!error) return postData.id

		if (error.message.includes("posts_pkey")) {
			throw new Error("UUID_COLLISION")
		}

		if (
			error.message.includes("posts_slug_unique") ||
			error.message.includes("posts_title_unique")
		) {

			throw new Error("TITLE_OR_SLUG_ALREADY_EXISTS")
		}

		if (isTransientError(error)) {
			continue
		}

		throw error
	}

	throw new Error("TRANSIENT_ERROR_RETRY_FAILED")
}
