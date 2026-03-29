// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/wavetermdev/waveterm/pkg/wshrpc"
	"github.com/wavetermdev/waveterm/pkg/wshrpc/wshclient"
)

var focusWindowSwitch bool

var focusWindowCmd = &cobra.Command{
	Use:     "focuswindow [-b blockid] [--switch]",
	Short:   "focus a waveterm window, optionally focusing a specific block",
	Args:    cobra.NoArgs,
	RunE:    focusWindowRun,
	PreRunE: preRunSetupRpcClient,
}

func init() {
	focusWindowCmd.Flags().BoolVar(&focusWindowSwitch, "switch", false, "allow switching workspace/tab if needed")
	rootCmd.AddCommand(focusWindowCmd)
}

func focusWindowRun(cmd *cobra.Command, args []string) (rtnErr error) {
	defer func() {
		sendActivity("focuswindow", rtnErr == nil)
	}()

	// blockArg is a package-level var set by the global -b persistent flag in wshcmd-root.go
	blockId := blockArg
	if blockId == "" {
		blockId = os.Getenv("WAVETERM_BLOCKID")
	}

	data := wshrpc.FocusBlockInWindowData{
		BlockId: blockId,
		Switch:  focusWindowSwitch,
	}

	err := wshclient.FocusBlockInWindowCommand(RpcClient, data, &wshrpc.RpcOpts{Timeout: 5000})
	if err != nil {
		return fmt.Errorf("focusing window: %w", err)
	}
	return nil
}
