import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { ConfirmDeleteModal } from "../components/modals/ConfirmDeleteModal";
import { InputPromptModal } from "../components/modals/InputPromptModal";
import { WirelessAdbModal } from "../components/modals/WirelessAdbModal";

vi.mock("../services/api", () => ({
  api: {
    getDeviceIp: vi.fn().mockResolvedValue("192.168.1.150"),
    switchToWireless: vi.fn().mockResolvedValue({
      success: true,
      message: "Device switched",
      endpoint: "192.168.1.150:5555",
    }),
    resetToUsb: vi.fn().mockResolvedValue({
      success: true,
      message: "Device reset to USB",
      endpoint: "usb",
    }),
    wirelessConnect: vi.fn().mockResolvedValue({
      success: true,
      message: "Connected",
      endpoint: "192.168.1.150:5555",
    }),
    wirelessPair: vi.fn().mockResolvedValue({
      success: true,
      message: "Paired",
      endpoint: "192.168.1.150:5555",
    }),
  },
}));

describe("Modal components", () => {
  it("renders ConfirmDeleteModal and handles confirmation", () => {
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();

    render(
      <ConfirmDeleteModal
        isOpen={true}
        onClose={handleClose}
        onConfirm={handleConfirm}
        itemCount={2}
        itemNames={["file1.txt", "file2.txt"]}
      />
    );

    expect(screen.getByText("Confirm Permanent Deletion")).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete 2 items\?/i)).toBeInTheDocument();
    expect(screen.getByText(/file1.txt/)).toBeInTheDocument();

    const deleteBtn = screen.getByText("Delete Permanently");
    fireEvent.click(deleteBtn);

    expect(handleConfirm).toHaveBeenCalled();
  });

  it("renders InputPromptModal and handles submission", () => {
    const handleSubmit = vi.fn();
    const handleClose = vi.fn();

    render(
      <InputPromptModal
        isOpen={true}
        onClose={handleClose}
        onSubmit={handleSubmit}
        title="Create New Directory"
        label="Directory Name"
        initialValue="New Folder"
        confirmLabel="Create"
      />
    );

    expect(screen.getByText("Create New Directory")).toBeInTheDocument();
    const input = screen.getByDisplayValue("New Folder");
    fireEvent.change(input, { target: { value: "My Photos" } });

    const createBtn = screen.getByText("Create");
    fireEvent.click(createBtn);

    expect(handleSubmit).toHaveBeenCalledWith("My Photos");
  });

  it("renders WirelessAdbModal with non-official USB-to-wireless and direct options", async () => {
    const handleClose = vi.fn();
    const handleSuccess = vi.fn();

    const mockDevices = [
      {
        serial: "usb_device_123",
        status: "authorized" as const,
        connection_type: "usb" as const,
        model: "Redmi Note 7",
      },
    ];

    render(
      <WirelessAdbModal
        isOpen={true}
        onClose={handleClose}
        onSuccess={handleSuccess}
        devices={mockDevices}
        selectedUsbSerial="usb_device_123"
      />
    );

    // Verify tabs
    expect(screen.getByText("USB to Wireless (Any Android)")).toBeInTheDocument();
    expect(screen.getByText("Direct Connect (No Pairing)")).toBeInTheDocument();
    expect(screen.getByText("Official Pairing (Android 11+)")).toBeInTheDocument();

    // Verify USB tab controls
    expect(screen.getByText(/Redmi Note 7/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Detect IP")).toBeInTheDocument();
    });
    expect(screen.getByText("Switch to Wireless & Connect")).toBeInTheDocument();

    // Switch to Direct Connect tab
    fireEvent.click(screen.getByText("Direct Connect (No Pairing)"));
    expect(screen.getByText("Direct TCP/IP Connection:")).toBeInTheDocument();
    expect(screen.getByText(/How to enable Wireless ADB on Rooted devices/)).toBeInTheDocument();
  });
});
