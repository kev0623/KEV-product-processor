'use client'

import { useState } from 'react'
import {
  Box,
  Button,
  Container,
  Heading,
  Stack,
  Text,
  Badge,
} from '@chakra-ui/react'
import { parseExcel, normalize } from '@/engine/adapter-in'
import { transform } from '@/engine/engine'
import { toExcelBlob, downloadBlob } from '@/engine/adapter-out'
import type { InputScript, OutputScript } from '@/engine/types'

type Status = 'idle' | 'ready' | 'done' | 'error'

export default function Home() {
  const [excelFile, setExcelFile]       = useState<File | null>(null)
  const [inputScript, setInputScript]   = useState<InputScript | null>(null)
  const [outputScript, setOutputScript] = useState<OutputScript | null>(null)
  const [status, setStatus]             = useState<Status>('idle')
  const [errorMsg, setErrorMsg]         = useState('')
  const [rowCount, setRowCount]         = useState(0)

  function readJson<T>(file: File): Promise<T> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = e => {
        try { resolve(JSON.parse(e.target?.result as string)) }
        catch { reject(new Error('JSON 格式錯誤')) }
      }
      reader.onerror = () => reject(new Error('檔案讀取失敗'))
      reader.readAsText(file)
    })
  }

  async function handleInputScript(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const script = await readJson<InputScript>(file)
      setInputScript(script)
    } catch (err) {
      setErrorMsg(String(err))
      setStatus('error')
    }
  }

  async function handleOutputScript(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const script = await readJson<OutputScript>(file)
      setOutputScript(script)
    } catch (err) {
      setErrorMsg(String(err))
      setStatus('error')
    }
  }

  async function handleRun() {
    if (!excelFile || !inputScript || !outputScript) return
    try {
      setStatus('idle')
      const buffer = await excelFile.arrayBuffer()
      const rows   = parseExcel(buffer)
      const orders = normalize(rows, inputScript)
      const output = transform(orders, outputScript)
      setRowCount(output.length)

      const blob = toExcelBlob(output)
      downloadBlob(blob, `output_${Date.now()}.xlsx`)
      setStatus('done')
    } catch (err) {
      setErrorMsg(String(err))
      setStatus('error')
    }
  }

  const allReady = excelFile && inputScript && outputScript

  return (
    <Container maxW="600px" py={12}>
      <Stack gap={8}>

        <Box>
          <Heading size="lg">HHG Engine</Heading>
          <Text color="gray.500" mt={1}>商品資料轉換引擎</Text>
        </Box>

        <Stack gap={4}>
          <FileRow
            label="① 商品 Excel"
            accept=".xlsx,.xls"
            hint={excelFile?.name}
            onChange={e => setExcelFile(e.target.files?.[0] ?? null)}
          />
          <FileRow
            label="② 品牌腳本 (brand.json)"
            accept=".json"
            hint={inputScript ? `格式: ${inputScript.input_format}` : undefined}
            onChange={handleInputScript}
          />
          <FileRow
            label="③ 平台腳本 (platform.json)"
            accept=".json"
            hint={outputScript ? `${Object.keys(outputScript).filter(k => !k.startsWith('_')).length} 個欄位` : undefined}
            onChange={handleOutputScript}
          />
        </Stack>

        <Button
          colorPalette="blue"
          size="lg"
          disabled={!allReady}
          onClick={handleRun}
        >
          執行轉換
        </Button>

        {status === 'done' && (
          <Box p={4} bg="green.50" borderRadius="md">
            <Text color="green.700">
              完成，已下載 {rowCount} 筆資料
            </Text>
          </Box>
        )}

        {status === 'error' && (
          <Box p={4} bg="red.50" borderRadius="md">
            <Text color="red.700" fontFamily="mono" fontSize="sm">
              {errorMsg}
            </Text>
          </Box>
        )}

        <Box p={4} bg="gray.50" borderRadius="md">
          <Text fontSize="sm" color="gray.500" mb={2}>範例腳本下載</Text>
          <Stack direction="row" gap={3}>
            <a href="/scripts/example/input.json" download style={{ fontSize: 14 }}>
              input.json
            </a>
            <a href="/scripts/example/output.json" download style={{ fontSize: 14 }}>
              output.json
            </a>
          </Stack>
        </Box>

      </Stack>
    </Container>
  )
}

function FileRow({
  label,
  accept,
  hint,
  onChange,
}: {
  label: string
  accept: string
  hint?: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <Box>
      <Text fontWeight="medium" mb={1}>{label}</Text>
      <input type="file" accept={accept} onChange={onChange} />
      {hint && (
        <Text fontSize="sm" color="green.600" mt={1}>{hint}</Text>
      )}
    </Box>
  )
}
